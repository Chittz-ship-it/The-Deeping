import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// DEEPING VIEWER BUILD: v1.89-constellation-overgrowth
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
  metalness:.72, roughness:.25, ghostly:false, toughened:false, toxic:false,
  frosted:false, fireWreathed:false, arcaneCharged:false,
  bloodbound:false, stormCharged:false, crowned:false,
  infrared:false, iridescent:false, ultraviolet:false, elementPalette:[],
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
  if(/envenomed|venomkissed|toxic/.test(lower))Object.assign(inferred,{toxic:true,accent:'#65a30d',emissive:'#a3e635',elementPalette:['#65a30d','#a3e635']});
  if(/rimebound|frost|ice/.test(lower))Object.assign(inferred,{frosted:true,accent:'#bae6fd',emissive:'#e0f2fe'});
  if(/fire|flame|ember|inferno/.test(lower))Object.assign(inferred,{fireWreathed:true,accent:'#f97316',emissive:'#ff5a24'});
  if(/arcane|runesung|spell/.test(lower))Object.assign(inferred,{arcaneCharged:true,accent:'#c084fc',emissive:'#e879f9'});
  if(/bloodbound/.test(lower))Object.assign(inferred,{bloodbound:true,accent:'#be123c',emissive:'#fb7185'});
  if(/thunderstruck/.test(lower))Object.assign(inferred,{stormCharged:true,accent:'#fde047',emissive:'#fef08a'});
  if(/crowned/.test(lower))Object.assign(inferred,{crowned:true,accent:'#fbbf24',emissive:'#fde68a'});
  if(/rimeglass/.test(lower))Object.assign(inferred,{frosted:true,accent:'#bae6fd',emissive:'#e0f2fe'});
  if(/venomglass/.test(lower))Object.assign(inferred,{toxic:true,accent:'#65a30d',emissive:'#a3e635'});
  if(/emberveined|starforged/.test(lower))Object.assign(inferred,{fireWreathed:true,accent:'#f97316',emissive:'#ff5a24'});
  if(/runecarved|moonlit|starforged/.test(lower))Object.assign(inferred,{arcaneCharged:true,accent:'#c084fc',emissive:'#e879f9'});
  if(/prismatic|pearlescent|oilslick/.test(lower))Object.assign(inferred,{iridescent:true,primary:'#67e8f9',secondary:'#ff7ad9',accent:'#fef08a'});
  if(lower.includes('infrared'))Object.assign(inferred,{infrared:true,accent:'#ff1744',emissive:'#ff1744',metalness:.62,roughness:.12});
  if(lower.includes('iridescent'))Object.assign(inferred,{iridescent:true,primary:'#67e8f9',secondary:'#ff7ad9',accent:'#fef08a',emissive:'#a78bfa',metalness:.28,roughness:.1});
  if(lower.includes('ultraviolet'))Object.assign(inferred,{ultraviolet:true,accent:'#a855f7',emissive:'#c084fc'});
  return {...FALLBACK_PROFILE,...inferred,...provided,elementPalette:provided.elementPalette||inferred.elementPalette||[]};
}

function materialRole(name='') {
  const upper=String(name).toUpperCase();
  if (upper.includes('EMISSIVE') || upper.includes('RUNE') || upper.includes('ENERGY')) return 'emissive';
  if (upper.includes('ACCENT') || upper.includes('GEM') || upper.includes('EYE')) return 'accent';
  if (upper.includes('SECONDARY') || upper.includes('LEATHER') || upper.includes('GRIP')) return 'secondary';
  return 'primary';
}

function pixelNoise(x,y,seed=0) {
  let value=Math.imul(x+seed*17,374761393)+Math.imul(y+seed*31,668265263);
  value=(value^(value>>>13))*1274126177;
  return ((value^(value>>>16))>>>0)/4294967295;
}

function surfaceValues(kind,x,y,size,seed) {
  const n=pixelNoise(x,y,seed),n2=pixelNoise(Math.floor(x/3),Math.floor(y/3),seed+19);
  const nx=x/size,ny=y/size;
  let height=.5,rough=.55;
  if(kind==='leather'){
    const pores=n<.075?-.42:0;
    height=.54+Math.sin(x*.42+y*.19)*.07+Math.sin(x*.13-y*.37)*.055+pores;
    rough=.72+n2*.22;
  }else if(kind==='wood'){
    const grain=Math.sin((x+Math.sin(y*.11)*8)*.31+Math.sin(y*.035)*3);
    height=.5+grain*.22+n*.035;rough=.62+grain*.13+n2*.08;
  }else if(kind==='cloth'){
    const warp=Math.max(0,Math.cos(x*Math.PI*.5))*.22, weft=Math.max(0,Math.cos(y*Math.PI*.5))*.22;
    height=.38+warp+weft+n*.035;rough=.82+n2*.13;
  }else if(kind==='fur'){
    const strand=Math.sin((x*.72)+(y*.12)+Math.sin(y*.09)*4);
    height=.48+strand*.2+(n-.5)*.16;rough=.88+n2*.1;
  }else if(kind==='stone'){
    const grit=(n-.5)*.34,crack=((x*13+y*29+seed)%71)<2?-.48:0;
    height=.54+grit+crack;rough=.74+n2*.22;
  }else if(kind==='bone'){
    const pore=n<.035?-.3:0;
    height=.56+Math.sin(x*.12+y*.08)*.06+pore;rough=.56+n2*.2;
  }else if(kind==='scales'){
    const cellX=(x%16)-8,cellY=((y+(Math.floor(x/16)%2)*8)%16)-8;
    const distance=Math.sqrt((cellX/8)**2+(cellY/7)**2);
    height=.72-Math.min(1,distance)*.42+(distance>.82?-.18:0);rough=.4+n2*.18;
  }else if(kind==='venom'){
    const bubble=Math.sin(nx*47+Math.sin(ny*31)*3)*Math.sin(ny*53)*.14;
    height=.58+bubble+(n>.94?.24:0);rough=.22+n2*.2;
  }else if(kind==='frost'){
    const crystal=Math.max(Math.abs(Math.sin((x+y)*.19)),Math.abs(Math.cos((x-y)*.23)));
    const rime=n>.82?.3:0;
    height=.45+crystal*.25+rime;rough=.38+n2*.34;
  }else if(kind==='gem'){
    const facet=Math.abs(Math.sin((x+y)*.22)*Math.cos((x-y)*.17));
    height=.46+facet*.12;rough=.08+n2*.08;
  }else{
    const scratch=((x*7+y*17+seed)%83)<2?-.35:0;
    height=.56+(n2-.5)*.12+scratch;rough=.22+n2*.22;
  }
  return [Math.max(0,Math.min(1,height)),Math.max(.04,Math.min(1,rough))];
}

function surfaceTextureSet(kind='metal',seed=0) {
  const size=128,bumpData=new Uint8Array(size*size*4),roughData=new Uint8Array(size*size*4),albedoData=new Uint8Array(size*size*4);
  const shadeProfile={
    metal:[.68,.36],leather:[.48,.5],wood:[.52,.48],cloth:[.64,.34],fur:[.58,.38],
    stone:[.5,.48],bone:[.68,.3],scales:[.56,.42],venom:[.66,.32],frost:[.86,.12],gem:[.82,.18],
  }[kind]||[.64,.36];
  for(let y=0;y<size;y+=1)for(let x=0;x<size;x+=1){
    const index=(y*size+x)*4,[height,rough]=surfaceValues(kind,x,y,size,seed);
    const bump=Math.round(height*255),roughness=Math.round(rough*255),shade=Math.round(Math.max(0,Math.min(1,shadeProfile[0]+height*shadeProfile[1]))*255);
    bumpData[index]=bumpData[index+1]=bumpData[index+2]=bump;bumpData[index+3]=255;
    roughData[index]=roughData[index+1]=roughData[index+2]=roughness;roughData[index+3]=255;
    albedoData[index]=albedoData[index+1]=albedoData[index+2]=shade;albedoData[index+3]=255;
  }
  const bump=new THREE.DataTexture(bumpData,size,size,THREE.RGBAFormat);
  const roughness=new THREE.DataTexture(roughData,size,size,THREE.RGBAFormat);
  const albedo=new THREE.DataTexture(albedoData,size,size,THREE.RGBAFormat);albedo.colorSpace=THREE.SRGBColorSpace;
  const repeat={metal:6,leather:4,wood:2.5,cloth:7,fur:5,stone:3,bone:3.5,scales:4,venom:3,frost:5,gem:2}[kind]||4;
  for(const texture of [bump,roughness,albedo]){
    texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(kind==='wood'?repeat*.7:repeat,kind==='wood'?repeat*1.8:repeat);
    texture.needsUpdate=true;
  }
  return {bump,roughness,albedo};
}

function ensureSurfaceUVs(geometry) {
  if(geometry.attributes.uv)return geometry;
  const mapped=geometry.index?geometry.toNonIndexed():geometry;
  mapped.computeBoundingBox();
  const {min,max}=mapped.boundingBox,span=new THREE.Vector3().subVectors(max,min);
  const position=mapped.attributes.position,uv=new Float32Array(position.count*2);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  const safe=value=>Math.max(value,.0001);
  for(let start=0;start<position.count;start+=3){
    a.fromBufferAttribute(position,start);b.fromBufferAttribute(position,start+1);c.fromBufferAttribute(position,start+2);
    normal.subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    const axis=Math.abs(normal.x)>Math.abs(normal.y)&&Math.abs(normal.x)>Math.abs(normal.z)?'x':Math.abs(normal.y)>Math.abs(normal.z)?'y':'z';
    for(let offset=0;offset<3;offset+=1){
      const vertex=new THREE.Vector3().fromBufferAttribute(position,start+offset);
      const u=axis==='x'?(vertex.z-min.z)/safe(span.z):(vertex.x-min.x)/safe(span.x);
      const v=axis==='z'?(vertex.y-min.y)/safe(span.y):(vertex.z-min.z)/safe(span.z);
      uv[(start+offset)*2]=u;uv[(start+offset)*2+1]=v;
    }
  }
  mapped.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return mapped;
}

function proceduralSceneFromMesh(meshData) {
  const root=new THREE.Group();
  const buckets=new Map();
  const vertices=Array.isArray(meshData?.vertices)?meshData.vertices:[];
  (meshData?.faces||[]).forEach(face=>{
    const colour=String(face.color||'#8d99a8');
    const alpha=Math.max(0,Math.min(1,Number(face.alpha??1)));
    const key=`${colour}|${alpha.toFixed(3)}`;
    if(!buckets.has(key))buckets.set(key,{colour,alpha,positions:[]});
    const bucket=buckets.get(key);
    [face.a,face.b,face.c].forEach(index=>{
      const point=vertices[index]||{x:0,y:0,z:0};
      bucket.positions.push(Number(point.x)||0,Number(point.y)||0,Number(point.z)||0);
    });
  });
  buckets.forEach((bucket,index)=>{
    if(!bucket.positions.length)return;
    const raw=new THREE.BufferGeometry();
    raw.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));
    let geometry=mergeVertices(raw,.0001);
    raw.dispose();
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({color:new THREE.Color(bucket.colour),roughness:.3,metalness:.72,transparent:bucket.alpha<.999,opacity:bucket.alpha,depthWrite:bucket.alpha>=.999});
    material.name='DEEP_PRIMARY_PROCEDURAL';
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`PROCEDURAL_PRIMARY_${index}`;
    mesh.userData.proceduralColour=bucket.colour;
    mesh.userData.proceduralAlpha=bucket.alpha;
    root.add(mesh);
  });
  root.name='DEEPING_PROCEDURAL_PBR_ROOT';
  return root;
}

function surfaceKind(role,profile,objectName='',label='') {
  const text=`${objectName} ${label}`.toLowerCase();
  if(profile.frosted&&role!=='secondary')return 'frost';
  if(profile.toxic&&(role==='accent'||role==='emissive'))return 'venom';
  if(profile.toughened&&role!=='emissive')return 'leather';
  if((role==='accent'||role==='emissive')&&/(ruby|emerald|sapphire|diamond|obsidian|gem|crystal|encrust)/.test(text))return 'gem';
  if(/venom|poison|slime|ooze|acid|rot/.test(text))return 'venom';
  if(/leather|grip|strap|wrap|hide|boot|cuff/.test(text))return 'leather';
  if(/haft|shaft|bow|wood|stem|branch|cork/.test(text))return 'wood';
  if(/cloak|cape|mantle|robe|cloth|coat/.test(text))return 'cloth';
  if(/fur|tuft|pelt/.test(text))return 'fur';
  if(/bone|skull|tusk|tooth|fang|skeleton/.test(text))return 'bone';
  if(/stone|rock|golem|obelisk|clay|brick/.test(text))return 'stone';
  if(/scale|dragon|serpent|croc|reptile/.test(text))return 'scales';
  return 'metal';
}

const SURFACE_SETTINGS={
  metal:{metalness:.9,roughness:.28,bumpScale:.075,clearcoat:.42},
  leather:{metalness:.01,roughness:.9,bumpScale:.36,clearcoat:.015},
  wood:{metalness:.01,roughness:.72,bumpScale:.21,clearcoat:.06},
  cloth:{metalness:0,roughness:.92,bumpScale:.16,clearcoat:0},
  fur:{metalness:0,roughness:.96,bumpScale:.3,clearcoat:0},
  stone:{metalness:.01,roughness:.86,bumpScale:.36,clearcoat:0},
  bone:{metalness:0,roughness:.66,bumpScale:.14,clearcoat:.08},
  scales:{metalness:.1,roughness:.5,bumpScale:.28,clearcoat:.28},
  venom:{metalness:.02,roughness:.18,bumpScale:.2,clearcoat:.95},
  frost:{metalness:.04,roughness:.42,bumpScale:.28,clearcoat:.92},
  gem:{metalness:.02,roughness:.06,bumpScale:.04,clearcoat:1},
};

function physicalMaterial(role,profile,original,objectName='',surface='metal',textures=null) {
  const palette=profile.elementPalette||[];
  const paletteColour=palette.length && (role==='accent'||role==='emissive') ? palette[hash32(objectName)%palette.length] : null;
  const color=paletteColour || profile[role] || profile.primary;
  const emissive=profile.bloodbound ? '#fb7185' : profile.stormCharged ? '#fde047' : profile.crowned ? '#fbbf24' : profile.infrared ? '#ff1744' : profile.fireWreathed ? '#ff5a24' : profile.arcaneCharged ? '#c084fc' : profile.ultraviolet ? '#7c3aed' : role==='emissive' ? (paletteColour || profile.emissive || profile.accent) : '#000000';
  const ghost=!!profile.ghostly;
  const settings=SURFACE_SETTINGS[surface]||SURFACE_SETTINGS.metal;
  const gem=surface==='gem',venom=surface==='venom',frost=surface==='frost';
  return new THREE.MeshPhysicalMaterial({
    name:`DEEPING_${role.toUpperCase()}_${surface.toUpperCase()}`,
    color:new THREE.Color(color),
    emissive:new THREE.Color(emissive),
    emissiveIntensity:profile.bloodbound||profile.stormCharged||profile.crowned ? (role==='emissive'?3.2:.38) : profile.infrared ? (role==='emissive'?3.2:.62) : profile.fireWreathed ? (role==='emissive'?3.35:.48) : profile.arcaneCharged ? (role==='emissive'?3.1:.42) : profile.ultraviolet ? (role==='emissive'?2.8:.34) : frost ? .1 : role==='emissive' ? 2.3 : 0,
    metalness:profile.iridescent ? .24 : surface==='metal'?(profile.metalness??settings.metalness):settings.metalness,
    roughness:profile.iridescent ? .09 : surface==='metal'?(profile.roughness??settings.roughness):settings.roughness,
    clearcoat:profile.iridescent ? 1 : settings.clearcoat,
    clearcoatRoughness:gem ? .06 : venom ? .12 : frost ? .38 : profile.iridescent ? .06 : .22,
    transparent:ghost,
    opacity:ghost ? .38 : 1,
    transmission:ghost ? .48 : gem ? .34 : frost ? .2 : venom ? .08 : 0,
    thickness:ghost ? .7 : gem ? .42 : frost ? .28 : .1,
    ior:ghost ? 1.24 : gem ? 1.78 : frost ? 1.31 : 1.5,
    iridescence:profile.iridescent?1:0,
    iridescenceIOR:profile.iridescent?1.82:1.3,
    iridescenceThicknessRange:profile.iridescent?[120,760]:[100,400],
    depthWrite:!ghost,
    side:ghost ? THREE.DoubleSide : THREE.FrontSide,
    normalMap:original?.normalMap || null,
    bumpMap:original?.bumpMap||textures?.bump||null,
    bumpScale:original?.bumpMap?(original?.bumpScale||1):settings.bumpScale,
    roughnessMap:original?.roughnessMap||textures?.roughness||null,
    // Authored colour maps were masking the spectral tint. Iridescent gear
    // keeps procedural grain/bump but uses a neutral albedo so the animated
    // rainbow is visibly present across the whole surface.
    map:profile.iridescent?(textures?.albedo||null):(original?.map||textures?.albedo||null),
    aoMap:original?.aoMap || null,
  });
}

export default function BlenderModelViewer({ src, label, size=220, compact=false, profile:providedProfile={}, fallback=null, proceduralMesh=null, proceduralKey='', proceduralLabel='FORGED MESH' }) {
  const profile=profileFromLabel(label,providedProfile);
  const elementKey=(profile.elementPalette||[]).join(',');
  const mountRef=useRef(null);
  const [status,setStatus]=useState('loading');
  const [loadedSource,setLoadedSource]=useState('');
  const [loadedKind,setLoadedKind]=useState('GLB');
  const sourceKey=expandedModelSources(src,label).join('|');

  useEffect(()=>{
    const mount=mountRef.current;
    const sources=sourceKey.split('|').filter(Boolean);
    if(!mount || (!sources.length&&!proceduralMesh?.vertices?.length)) { setStatus('failed'); return undefined; }
    setStatus('loading');
    setLoadedSource('');
    setLoadedKind(proceduralMesh?.vertices?.length?'FORGE':'GLB');
    let disposed=false,frame=0,resizeObserver;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(32,1,.01,100);
    camera.position.set(0,.12,5.25);
    let renderer;
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    } catch (error) {
      setStatus('failed');
      return undefined;
    }
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
    const textureSets=new Map();
    const textureSeed=hash32(`${label}|${sourceKey}`);
    const texturesFor=surface=>{
      if(!textureSets.has(surface))textureSets.set(surface,surfaceTextureSet(surface,textureSeed));
      return textureSets.get(surface);
    };
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
    const liveEffects={drips:[],halos:[],flames:[],arcaneRings:[],arcaneMotes:[],iridescentMaterials:[],iridescentLights:[]};

    const loader=new GLTFLoader();
    const acceptModel=(gltf,acceptedLabel='',acceptedKind='GLB')=>{
      if(disposed)return;
      specimen=gltf.scene;
      specimen.traverse(node=>{
        if(!node.isMesh)return;
        node.castShadow=!compact;node.receiveShadow=!compact;
        if(!node.geometry.attributes.normal)node.geometry.computeVertexNormals();
        const originalGeometry=node.geometry;
        node.geometry=ensureSurfaceUVs(originalGeometry);
        if(node.geometry!==originalGeometry)originalGeometry.dispose();
        const original=Array.isArray(node.material)?node.material[0]:node.material;
        const role=materialRole(`${node.name} ${original?.name||''}`);
        const proceduralColour=node.userData?.proceduralColour;
        const materialProfile=proceduralColour?{...profile,primary:proceduralColour,secondary:proceduralColour,accent:proceduralColour}:profile;
        const surface=surfaceKind(role,materialProfile,node.name,label);
        node.material=physicalMaterial(role,materialProfile,original,node.name,surface,texturesFor(surface));
        if(Number(node.userData?.proceduralAlpha)<.999){node.material.transparent=true;node.material.opacity*=Number(node.userData.proceduralAlpha)||1;node.material.depthWrite=false;}
        if(profile.iridescent)liveEffects.iridescentMaterials.push({material:node.material,phase:liveEffects.iridescentMaterials.length*.19});
      });
      const box=new THREE.Box3().setFromObject(specimen),center=box.getCenter(new THREE.Vector3()),dimensions=box.getSize(new THREE.Vector3());
      specimen.position.sub(center);
      const modelScale=2.28/Math.max(dimensions.x,dimensions.y,dimensions.z,.001);
      specimen.scale.setScalar(modelScale);
      const postScaleBox=new THREE.Box3().setFromObject(specimen),bottom=postScaleBox.min.y;
      specimen.position.y-=bottom+.98;
      scene.add(specimen);
      const finalBox=new THREE.Box3().setFromObject(specimen),span=finalBox.getSize(new THREE.Vector3()),mid=finalBox.getCenter(new THREE.Vector3());
      if(profile.toxic||profile.bloodbound){
        const poisonMaterial=new THREE.MeshPhysicalMaterial({color:profile.bloodbound?0xbe123c:0x65a30d,emissive:profile.bloodbound?0xfb7185:0xa3e635,emissiveIntensity:.75,roughness:.12,clearcoat:1,transparent:true,opacity:.9,transmission:.12});
        for(let index=0;index<5;index+=1){
          const radius=.045+(index%3)*.012,droplet=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),poisonMaterial);
          const x=finalBox.min.x+span.x*(.12+index*.19),startY=finalBox.min.y+span.y*(.35+(index%3)*.17);
          droplet.position.set(x,startY,finalBox.max.z+.055+(index%2)*.025);scene.add(droplet);
          liveEffects.drips.push({mesh:droplet,startY,range:.34+index*.055,speed:.38+index*.07,phase:index*.17});
        }
      }
      if(profile.frosted){
        const iceMaterial=new THREE.MeshPhysicalMaterial({color:0xe0f2fe,emissive:0x7dd3fc,emissiveIntensity:.18,roughness:.32,clearcoat:1,transmission:.3,thickness:.24,ior:1.31,transparent:true,opacity:.88});
        for(let index=0;index<14;index+=1){
          const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.045+(index%4)*.012,0),iceMaterial);
          const hx=(hash32(`${label}|ice-x|${index}`)%1000)/1000,hy=(hash32(`${label}|ice-y|${index}`)%1000)/1000;
          crystal.position.set(finalBox.min.x+span.x*hx,finalBox.min.y+span.y*(.16+hy*.78),finalBox.max.z+.035+(index%3)*.025);
          crystal.scale.y=1.4+(index%4)*.28;crystal.rotation.z=(index%5-.2)*.18;scene.add(crystal);
        }
        for(let index=0;index<4;index+=1){
          const length=.16+index*.035,icicle=new THREE.Mesh(new THREE.ConeGeometry(.045,length,7),iceMaterial);
          icicle.position.set(finalBox.min.x+span.x*(.18+index*.21),finalBox.min.y-length*.35,finalBox.max.z+.03);icicle.rotation.z=Math.PI;scene.add(icicle);
        }
      }
      if(profile.fireWreathed){
        const flameColours=[0xef4444,0xf97316,0xfde047];
        for(let index=0;index<11;index+=1){
          const height=.15+(index%4)*.045;
          const flameMaterial=new THREE.MeshBasicMaterial({color:flameColours[index%flameColours.length],transparent:true,opacity:.78,depthWrite:false,blending:THREE.AdditiveBlending});
          const flame=new THREE.Mesh(new THREE.ConeGeometry(.045+(index%3)*.012,height,8),flameMaterial);
          const hx=(hash32(`${label}|fire-x|${index}`)%1000)/1000,hy=(hash32(`${label}|fire-y|${index}`)%1000)/1000;
          flame.position.set(finalBox.min.x+span.x*(.08+hx*.84),finalBox.min.y+span.y*(.12+hy*.72),finalBox.max.z+.07+(index%3)*.025);
          flame.rotation.z=(hx-.5)*.45;scene.add(flame);liveEffects.flames.push({mesh:flame,baseY:flame.position.y,phase:index*.51,speed:2.6+(index%4)*.34});
        }
        const fireLight=new THREE.PointLight(0xff5a24,6.2,5.5);fireLight.position.set(mid.x,mid.y,finalBox.max.z+.9);scene.add(fireLight);
      }
      if(profile.arcaneCharged||profile.stormCharged){
        const ringRadius=Math.max(span.x,span.y)*.53;
        for(let index=0;index<3;index+=1){
          const runeMaterial=new THREE.MeshBasicMaterial({color:profile.stormCharged?(index===1?0xffffff:0xfde047):(index===1?0xe879f9:0xa855f7),transparent:true,opacity:.58-index*.08,depthWrite:false,blending:THREE.AdditiveBlending});
          const ring=new THREE.Mesh(new THREE.TorusGeometry(ringRadius*(1+index*.17),.014+(index===0?.008:0),7,72),runeMaterial);
          ring.position.set(mid.x,mid.y,finalBox.max.z+.09+index*.022);ring.rotation.x=index*.34;ring.rotation.y=index*.27;scene.add(ring);liveEffects.arcaneRings.push({mesh:ring,phase:index*.73,direction:index%2?-1:1});
        }
        const moteMaterial=new THREE.MeshBasicMaterial({color:profile.stormCharged?0xfef08a:0xf0abfc,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending});
        for(let index=0;index<8;index+=1){
          const mote=new THREE.Mesh(new THREE.OctahedronGeometry(.034+(index%3)*.009,0),moteMaterial.clone());
          mote.position.set(mid.x,mid.y,finalBox.max.z+.14);scene.add(mote);liveEffects.arcaneMotes.push({mesh:mote,mid:mid.clone(),radius:ringRadius*(.8+(index%3)*.2),phase:Math.PI*2*index/8,speed:.72+(index%4)*.12,z:finalBox.max.z+.1+(index%3)*.06});
        }
        const arcaneLight=new THREE.PointLight(profile.stormCharged?0xfde047:0xc084fc,5.3,5);arcaneLight.position.set(mid.x,mid.y,finalBox.max.z+.9);scene.add(arcaneLight);
      }
      if(profile.iridescent){
        for(let index=0;index<3;index+=1){
          const spectralLight=new THREE.PointLight(new THREE.Color().setHSL(index/3,.95,.62),3.4,4.8);
          spectralLight.position.set(mid.x,mid.y,finalBox.max.z+.75);scene.add(spectralLight);
          liveEffects.iridescentLights.push({light:spectralLight,mid:mid.clone(),radius:Math.max(span.x,span.y)*.9,phase:Math.PI*2*index/3});
        }
      }
      if(profile.infrared||profile.ultraviolet||profile.crowned){
        const colour=profile.crowned?0xfbbf24:profile.infrared?0xff1744:0xa855f7;
        for(let index=0;index<2;index+=1){
          const haloMaterial=new THREE.MeshBasicMaterial({color:colour,transparent:true,opacity:index?.28:.55,depthWrite:false,blending:THREE.AdditiveBlending});
          const halo=new THREE.Mesh(new THREE.TorusGeometry(Math.max(span.x,span.y)*(.42+index*.15),.018-index*.004,8,64),haloMaterial);
          halo.position.set(mid.x,mid.y,finalBox.max.z+.08+index*.025);scene.add(halo);liveEffects.halos.push({mesh:halo,phase:index*.5});
        }
        const radiance=new THREE.PointLight(colour,profile.infrared?5.8:profile.crowned?5.1:4.2,5);radiance.position.set(mid.x,mid.y,finalBox.max.z+1);scene.add(radiance);
      }
      controls.target.set(0,.08,0);controls.update();
      setLoadedSource(acceptedLabel||(sources[sourceIndex-1]||'model.glb').split('/').pop().replace(/\.glb$/i,'').replaceAll('_',' '));
      setLoadedKind(acceptedKind);
      setStatus('ready');
      if(compact)renderer.render(scene,camera);
    };
    let sourceIndex=0;
    const tryNextSource=()=>{
      if(disposed)return;
      if(sourceIndex>=sources.length){setStatus('failed');return;}
      loader.load(sources[sourceIndex++],acceptModel,undefined,tryNextSource);
    };
    if(proceduralMesh?.vertices?.length)acceptModel({scene:proceduralSceneFromMesh(proceduralMesh)},proceduralLabel,'FORGE');
    else tryNextSource();

    const floor=new THREE.Mesh(new THREE.CircleGeometry(1.42,64),new THREE.ShadowMaterial({color:0x000000,opacity:.42}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-1.03;floor.receiveShadow=true;scene.add(floor);

    const resize=()=>{const rect=mount.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(compact)renderer.render(scene,camera);};
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(mount);resize();
    const tick=()=>{
      if(disposed)return;
      const time=performance.now()/1000;
      liveEffects.drips.forEach(effect=>{const progress=(time*effect.speed+effect.phase)%1;effect.mesh.position.y=effect.startY-progress*effect.range;const pulse=.72+Math.sin(progress*Math.PI)*.55;effect.mesh.scale.set(pulse,1.1+pulse*.35,pulse);});
      liveEffects.halos.forEach(effect=>{const pulse=1+Math.sin(time*3.7+effect.phase*Math.PI)*.08;effect.mesh.scale.setScalar(pulse);effect.mesh.material.opacity=.22+(Math.sin(time*4.1+effect.phase*Math.PI)+1)*.2;});
      liveEffects.flames.forEach(effect=>{const pulse=.76+(Math.sin(time*effect.speed+effect.phase)+1)*.25;effect.mesh.scale.set(pulse,1.05+pulse*.38,pulse);effect.mesh.position.y=effect.baseY+Math.sin(time*effect.speed*.66+effect.phase)*.025;effect.mesh.material.opacity=.5+pulse*.3;});
      liveEffects.arcaneRings.forEach(effect=>{effect.mesh.rotation.z=time*.46*effect.direction+effect.phase;effect.mesh.rotation.y+=.0025*effect.direction;const pulse=1+Math.sin(time*2.1+effect.phase)*.045;effect.mesh.scale.setScalar(pulse);});
      liveEffects.arcaneMotes.forEach(effect=>{const angle=time*effect.speed+effect.phase;effect.mesh.position.set(effect.mid.x+Math.cos(angle)*effect.radius,effect.mid.y+Math.sin(angle)*effect.radius*.86,effect.z+Math.sin(angle*1.7)*.05);effect.mesh.rotation.x=angle*1.4;effect.mesh.rotation.y=angle*.9;});
      liveEffects.iridescentMaterials.forEach((effect,index)=>{
        const hue=(time*.12+effect.phase)%1,material=effect.material;
        material.color.setHSL(hue,.88,.56);
        material.emissive.setHSL((hue+.13)%1,.9,.34);
        material.emissiveIntensity=.2+(Math.sin(time*1.8+index*.63)+1)*.12;
        material.iridescence=1;
        material.iridescenceIOR=1.42+(Math.sin(time*1.35+index*.7)+1)*.22;
        material.iridescenceThicknessRange=[90+Math.sin(time+index)*35,820+Math.cos(time*.8+index)*110];
      });
      liveEffects.iridescentLights.forEach(effect=>{const angle=time*.72+effect.phase;effect.light.position.set(effect.mid.x+Math.cos(angle)*effect.radius,effect.mid.y+Math.sin(angle)*effect.radius*.7,effect.mid.z+1.05);effect.light.color.setHSL((time*.1+effect.phase/(Math.PI*2))%1,.96,.62);});
      controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(tick);
    };
    if(compact)renderer.render(scene,camera);else tick();

    return()=>{
      disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();controls.dispose();
      scene.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());}});
      textureSets.forEach(({bump,roughness,albedo})=>{bump.dispose();roughness.dispose();albedo.dispose();});
      environment.dispose();environmentMap.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[sourceKey,proceduralKey,compact,profile.primary,profile.secondary,profile.accent,profile.emissive,profile.ghostly,profile.toughened,profile.toxic,profile.bloodbound,profile.frosted,profile.fireWreathed,profile.arcaneCharged,profile.stormCharged,profile.crowned,profile.infrared,profile.iridescent,profile.ultraviolet,profile.metalness,profile.roughness,elementKey]);

  if(status==='failed')return fallback;
  return <div className={`blender-model-stage ${compact?'compact':''}`} style={{width:size,height:size,position:'relative'}} aria-label={label}>
    {status!=='ready'&&<div style={{position:'absolute',inset:0,opacity:.22,pointerEvents:'none'}}>{fallback}</div>}
    <div ref={mountRef} style={{position:'absolute',inset:0,touchAction:'none'}}/>
    {!compact&&<div className="blender-model-badge">PBR {loadedKind} · {loadedSource.toUpperCase() || 'LOADING'} · DRAG 360°</div>}
  </div>;
}
