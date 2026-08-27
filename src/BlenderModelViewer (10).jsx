import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

THREE.Cache.enabled=true;

const MODEL_VARIANT_COUNT=8;

const MODIFIER_COLOURS={
  ruby:'#dc2626',emerald:'#16a34a',sapphire:'#2563eb',diamond:'#e0f2fe',obsidian:'#171717',
  burgundy:'#7f1d1d',brown:'#78350f',olive:'#4d7c0f',navy:'#172554',white:'#f8fafc',grey:'#64748b',gray:'#64748b',black:'#09090b',
};

const ELEMENT_COLOURS={
  fire:'#ff5a24',flame:'#ff5a24',ember:'#f97316',frost:'#7dd3fc',ice:'#7dd3fc',tidal:'#22d3ee',water:'#22d3ee',
  venom:'#84cc16',poison:'#84cc16',arcane:'#c084fc',storm:'#fde047',lightning:'#fde047',void:'#8b5cf6',
  shadow:'#6366f1',blood:'#ef4444',solar:'#fbbf24',sun:'#fbbf24',moon:'#c4b5fd',rot:'#a3e635',spore:'#4ade80',
};

function hash32(value='') {
  let hash=2166136261;
  for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}

function canonicalModelSource(source='') {
  return String(source).replace(/_v\d+(?=\.glb(?:[?#]|$))/i,'');
}

function variantModelSource(base,variant) {
  if(variant===1)return base;
  return String(base).replace(/(\.glb)([?#].*)?$/i,`_v${variant}$1$2`);
}

function expandedModelSources(src,label='') {
  const supplied=(Array.isArray(src)?src:[src]).filter(Boolean);
  const families=[...new Set(supplied.map(canonicalModelSource))];
  const expanded=[];
  families.forEach(base=>{
    const start=hash32(`${label}|${base}`)%MODEL_VARIANT_COUNT;
    for(let offset=0;offset<MODEL_VARIANT_COUNT;offset+=1){
      expanded.push(variantModelSource(base,((start+offset)%MODEL_VARIANT_COUNT)+1));
    }
  });
  supplied.forEach(source=>expanded.push(source));
  return [...new Set(expanded)];
}

const FALLBACK_PROFILE = {
  primary:'#8d99a8', secondary:'#334155', accent:'#67e8f9', emissive:'#67e8f9',
  metalness:.72, roughness:.25, ghostly:false, toughened:false, elementPalette:[],
};

function profileFromLabel(label='',provided={}) {
  const lower=String(label).toLowerCase();
  const inferred={};
  const namedColours=Object.entries(MODIFIER_COLOURS).filter(([token])=>lower.includes(token));
  if(namedColours.length){
    inferred.primary=namedColours[0][1];
    inferred.secondary=namedColours[1]?.[1] || '#292524';
    inferred.accent=namedColours.at(-1)[1];
    inferred.emissive=namedColours.at(-1)[1];
  }
  const elements=[...new Set(Object.entries(ELEMENT_COLOURS).filter(([token])=>lower.includes(token)).map(([,colour])=>colour))];
  if(elements.length){
    inferred.elementPalette=elements;
    inferred.accent=elements[0];
    inferred.emissive=elements[1] || elements[0];
  }
  if(lower.includes('toughened'))Object.assign(inferred,{toughened:true,metalness:.24,roughness:.64,secondary:'#6b4423'});
  if(lower.includes('sharpened'))Object.assign(inferred,{metalness:.94,roughness:.11});
  if(lower.includes('ghostly'))inferred.ghostly=true;
  if(lower.includes('envenomed'))Object.assign(inferred,{accent:'#65a30d',emissive:'#a3e635',elementPalette:['#65a30d','#a3e635']});
  return {...FALLBACK_PROFILE,...inferred,...provided,elementPalette:provided.elementPalette||inferred.elementPalette||[]};
}

function materialRole(name='') {
  const upper=String(name).toUpperCase();
  if (upper.includes('EMISSIVE') || upper.includes('RUNE') || upper.includes('ENERGY')) return 'emissive';
  if (upper.includes('ACCENT') || upper.includes('GEM') || upper.includes('EYE')) return 'accent';
  if (upper.includes('SECONDARY') || upper.includes('LEATHER') || upper.includes('GRIP')) return 'secondary';
  return 'primary';
}

function detailTexture(kind='grain') {
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y+=1)for(let x=0;x<size;x+=1){
    const index=(y*size+x)*4;
    const wave=Math.sin(x*.73+y*.19)*18+Math.sin(x*.17-y*.61)*12;
    const pores=((x*37+y*57+x*y*13)%97)<(kind==='leather'?7:3)?-55:0;
    const value=Math.max(20,Math.min(235,145+wave+pores));
    data[index]=value;data[index+1]=value;data[index+2]=value;data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3.5,3.5);texture.needsUpdate=true;
  return texture;
}

function physicalMaterial(role, profile, original, objectName='',leatherTexture=null) {
  const palette=profile.elementPalette||[];
  const paletteColour=palette.length && (role==='accent'||role==='emissive') ? palette[hash32(objectName)%palette.length] : null;
  const color=paletteColour || profile[role] || profile.primary;
  const emissive=role==='emissive' ? (paletteColour || profile.emissive || profile.accent) : '#000000';
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
    bumpMap:profile.toughened && role!=='emissive' ? leatherTexture : (original?.bumpMap || null),
    bumpScale:profile.toughened && role!=='emissive' ? .14 : (original?.bumpScale || 1),
    map:original?.map || null,
    aoMap:original?.aoMap || null,
  });
}

export default function BlenderModelViewer({ src, label, size=220, compact=false, profile:providedProfile={}, fallback=null }) {
  const profile=profileFromLabel(label,providedProfile);
  const elementKey=(profile.elementPalette||[]).join(',');
  const mountRef=useRef(null);
  const [status,setStatus]=useState('loading');
  const [loadedSource,setLoadedSource]=useState('');
  const sourceKey=expandedModelSources(src,label).join('|');

  useEffect(()=>{
    const mount=mountRef.current;
    const sources=sourceKey.split('|').filter(Boolean);
    if(!mount || !sources.length) { setStatus('failed'); return undefined; }
    setStatus('loading');
    setLoadedSource('');
    let disposed=false,frame=0,resizeObserver;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(32,1,.01,100);
    camera.position.set(0,.12,5.25);
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
    const leatherTexture=profile.toughened?detailTexture('leather'):null;
    scene.environment=environmentMap;
    scene.add(new THREE.HemisphereLight(0xbfe8ff,0x090810,1.45));
    const key=new THREE.DirectionalLight(0xffe4c2,4.2);key.position.set(-3,4,4);key.castShadow=!compact;scene.add(key);
    const rim=new THREE.PointLight(profile.accent,5.5,8);rim.position.set(3,1,-2);scene.add(rim);
    const fill=new THREE.PointLight(0x7289ff,2.1,7);fill.position.set(-3,-1,2);scene.add(fill);

    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enablePan=false;controls.enableDamping=!compact;controls.dampingFactor=.065;
    controls.enabled=!compact;controls.autoRotate=!compact;controls.autoRotateSpeed=1.05;
    controls.minDistance=3.35;controls.maxDistance=8.5;
    let specimen=null;

    const loader=new GLTFLoader();
    const acceptModel=gltf=>{
      if(disposed)return;
      specimen=gltf.scene;
      specimen.traverse(node=>{
        if(!node.isMesh)return;
        node.castShadow=!compact;node.receiveShadow=!compact;
        if(!node.geometry.attributes.normal)node.geometry.computeVertexNormals();
        const original=Array.isArray(node.material)?node.material[0]:node.material;
        const role=materialRole(`${node.name} ${original?.name||''}`);
        node.material=physicalMaterial(role,profile,original,node.name,leatherTexture);
      });
      const box=new THREE.Box3().setFromObject(specimen),center=box.getCenter(new THREE.Vector3()),dimensions=box.getSize(new THREE.Vector3());
      specimen.position.sub(center);
      const modelScale=2.28/Math.max(dimensions.x,dimensions.y,dimensions.z,.001);
      specimen.scale.setScalar(modelScale);
      const postScaleBox=new THREE.Box3().setFromObject(specimen),bottom=postScaleBox.min.y;
      specimen.position.y-=bottom+.98;
      scene.add(specimen);
      controls.target.set(0,.08,0);controls.update();
      setLoadedSource((sources[sourceIndex-1]||'model.glb').split('/').pop().replace(/\.glb$/i,'').replaceAll('_',' '));
      setStatus('ready');
      if(compact)renderer.render(scene,camera);
    };
    let sourceIndex=0;
    const tryNextSource=()=>{
      if(disposed)return;
      if(sourceIndex>=sources.length){setStatus('failed');return;}
      loader.load(sources[sourceIndex++],acceptModel,undefined,tryNextSource);
    };
    tryNextSource();

    const floor=new THREE.Mesh(new THREE.CircleGeometry(1.42,64),new THREE.ShadowMaterial({color:0x000000,opacity:.42}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-1.03;floor.receiveShadow=true;scene.add(floor);

    const resize=()=>{const rect=mount.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(compact)renderer.render(scene,camera);};
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(mount);resize();
    const tick=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(tick);};
    if(compact)renderer.render(scene,camera);else tick();

    return()=>{
      disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();controls.dispose();
      scene.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());}});
      leatherTexture?.dispose();environment.dispose();environmentMap.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[sourceKey,compact,profile.primary,profile.secondary,profile.accent,profile.emissive,profile.ghostly,profile.toughened,profile.metalness,profile.roughness,elementKey]);

  if(status==='failed')return fallback;
  return <div className={`blender-model-stage ${compact?'compact':''}`} style={{width:size,height:size,position:'relative'}} aria-label={label}>
    {status!=='ready'&&<div style={{position:'absolute',inset:0,opacity:.22,pointerEvents:'none'}}>{fallback}</div>}
    <div ref={mountRef} style={{position:'absolute',inset:0,touchAction:'none'}}/>
    {!compact&&<div className="blender-model-badge">PBR GLB · {loadedSource.toUpperCase() || 'LOADING'} · DRAG 360°</div>}
  </div>;
}
