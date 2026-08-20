import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

THREE.Cache.enabled=true;

const FALLBACK_PROFILE = {
  primary:'#8d99a8', secondary:'#334155', accent:'#67e8f9', emissive:'#67e8f9',
  metalness:.72, roughness:.25, ghostly:false,
};

function materialRole(name='') {
  const upper=String(name).toUpperCase();
  if (upper.includes('EMISSIVE') || upper.includes('RUNE') || upper.includes('ENERGY')) return 'emissive';
  if (upper.includes('ACCENT') || upper.includes('GEM') || upper.includes('EYE')) return 'accent';
  if (upper.includes('SECONDARY') || upper.includes('LEATHER') || upper.includes('GRIP')) return 'secondary';
  return 'primary';
}

function physicalMaterial(role, profile, original) {
  const color=profile[role] || profile.primary;
  const emissive=role==='emissive' ? (profile.emissive || profile.accent) : '#000000';
  const ghost=!!profile.ghostly;
  return new THREE.MeshPhysicalMaterial({
    name:`DEEPING_${role.toUpperCase()}`,
    color:new THREE.Color(color),
    emissive:new THREE.Color(emissive),
    emissiveIntensity:role==='emissive' ? 2.3 : 0,
    metalness:role==='secondary' ? Math.min(.35,profile.metalness ?? .65) : (profile.metalness ?? .72),
    roughness:role==='accent' ? .16 : role==='secondary' ? .48 : (profile.roughness ?? .25),
    clearcoat:role==='secondary' ? .18 : .68,
    clearcoatRoughness:.18,
    transparent:ghost,
    opacity:ghost ? .38 : 1,
    transmission:ghost ? .48 : 0,
    thickness:ghost ? .7 : 0,
    ior:ghost ? 1.24 : 1.5,
    depthWrite:!ghost,
    side:ghost ? THREE.DoubleSide : THREE.FrontSide,
    normalMap:original?.normalMap || null,
    map:original?.map || null,
    aoMap:original?.aoMap || null,
  });
}

export default function BlenderModelViewer({ src, label, size=220, compact=false, profile:providedProfile={}, fallback=null }) {
  const profile={...FALLBACK_PROFILE,...providedProfile};
  const mountRef=useRef(null);
  const [status,setStatus]=useState('loading');

  useEffect(()=>{
    const mount=mountRef.current;
    if(!mount || !src) { setStatus('failed'); return undefined; }
    setStatus('loading');
    let disposed=false,frame=0,resizeObserver;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(32,1,.01,100);
    camera.position.set(0,.12,4.6);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,compact?1.35:2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.16;
    renderer.shadowMap.enabled=!compact;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const pmrem=new THREE.PMREMGenerator(renderer);
    const environment=new RoomEnvironment();
    const environmentMap=pmrem.fromScene(environment,.04).texture;
    scene.environment=environmentMap;
    scene.add(new THREE.HemisphereLight(0xbfe8ff,0x090810,1.45));
    const key=new THREE.DirectionalLight(0xffe4c2,4.2);key.position.set(-3,4,4);key.castShadow=!compact;scene.add(key);
    const rim=new THREE.PointLight(profile.accent,5.5,8);rim.position.set(3,1,-2);scene.add(rim);
    const fill=new THREE.PointLight(0x7289ff,2.1,7);fill.position.set(-3,-1,2);scene.add(fill);

    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enablePan=false;controls.enableDamping=!compact;controls.dampingFactor=.065;
    controls.enabled=!compact;controls.autoRotate=!compact;controls.autoRotateSpeed=1.05;
    controls.minDistance=2.7;controls.maxDistance=7;
    let specimen=null;

    const loader=new GLTFLoader();
    loader.load(src,gltf=>{
      if(disposed)return;
      specimen=gltf.scene;
      specimen.traverse(node=>{
        if(!node.isMesh)return;
        node.castShadow=!compact;node.receiveShadow=!compact;
        if(!node.geometry.attributes.normal)node.geometry.computeVertexNormals();
        const original=Array.isArray(node.material)?node.material[0]:node.material;
        const role=materialRole(`${node.name} ${original?.name||''}`);
        node.material=physicalMaterial(role,profile,original);
      });
      const box=new THREE.Box3().setFromObject(specimen),center=box.getCenter(new THREE.Vector3()),dimensions=box.getSize(new THREE.Vector3());
      specimen.position.sub(center);
      const modelScale=2.65/Math.max(dimensions.x,dimensions.y,dimensions.z,.001);
      specimen.scale.setScalar(modelScale);
      const postScaleBox=new THREE.Box3().setFromObject(specimen),bottom=postScaleBox.min.y;
      specimen.position.y-=bottom+.98;
      scene.add(specimen);
      controls.target.set(0,.08,0);controls.update();
      setStatus('ready');
      if(compact)renderer.render(scene,camera);
    },undefined,()=>{if(!disposed)setStatus('failed');});

    const floor=new THREE.Mesh(new THREE.CircleGeometry(1.42,64),new THREE.ShadowMaterial({color:0x000000,opacity:.42}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-1.03;floor.receiveShadow=true;scene.add(floor);

    const resize=()=>{const rect=mount.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(compact)renderer.render(scene,camera);};
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(mount);resize();
    const tick=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(tick);};
    if(compact)renderer.render(scene,camera);else tick();

    return()=>{
      disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();controls.dispose();
      scene.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());}});
      environment.dispose();environmentMap.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[src,compact,profile.primary,profile.secondary,profile.accent,profile.emissive,profile.ghostly,profile.metalness,profile.roughness]);

  if(status==='failed')return fallback;
  return <div className={`blender-model-stage ${compact?'compact':''}`} style={{width:size,height:size,position:'relative'}} aria-label={label}>
    {status!=='ready'&&<div style={{position:'absolute',inset:0,opacity:.22,pointerEvents:'none'}}>{fallback}</div>}
    <div ref={mountRef} style={{position:'absolute',inset:0,touchAction:'none'}}/>
    {!compact&&<div className="blender-model-badge">PBR GLB · DRAG 360°</div>}
  </div>;
}
