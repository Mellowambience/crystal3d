// crocotile.js — loader for Crocotile 3D .crocotile JSON assets
// Parses the real asset format exported by Crocotile 3D and builds Three.js meshes.
//
// REAL ASSET STRUCTURE (verified against assets/environment.crocotile):
//   json.config        -> tilesizeX/Y (16), skybox (base64), skyboxShape, etc.
//   json.model         -> [{ material, texture: <base64 data: URL>, object: [] }]
//   json.prefabs       -> [{ name, object: [ <mesh>, ... ] }]   <-- the real meshes live here
//   each mesh          -> { texture: <int index>, position:{x,y,z}, vertices:[{x,y,z}],
//                           faces:[[i,i,i]], uvs:[{x,y}], colors:[...optional] }
//
// The shared texture is json.model[0].texture (a base64 data URL) — every mesh
// indexes into it via mesh.texture. (Earlier loader tried modelMaterials[o.texture]
// where modelMaterials was built from json.model whose .object is empty, so every
// mesh fell back to a flat gray material and the model never appeared.)
import * as THREE from 'three';

function loadCrocotile(json, opts = {}) {
  const cfg = json.config || {};
  const tileX = cfg.tilesizeX || 16;
  const tileY = cfg.tilesizeY || 16;
  const group = new THREE.Group();
  group.name = 'crocotile_environment';

  // 1. Skybox base64 PNG -> scene background
  if (cfg.skybox && typeof cfg.skybox === 'string' && cfg.skybox.startsWith('data:image')) {
    const loader = new THREE.TextureLoader();
    loader.load(cfg.skybox, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      opts.onSkybox && opts.onSkybox(tex);
    });
  }

  // 2. Shared texture (the real one): model[0].texture is a base64 data URL
  const sharedTexSrc = (json.model && json.model[0] && json.model[0].texture) || null;
  const sharedMap = (sharedTexSrc && sharedTexSrc.startsWith('data:image'))
    ? new THREE.TextureLoader().load(sharedTexSrc)
    : null;
  if (sharedMap) {
    sharedMap.colorSpace = THREE.SRGBColorSpace;
    sharedMap.magFilter = THREE.NearestFilter;
    sharedMap.minFilter = THREE.NearestFilter;
  }

  // 3. Collect all real mesh objects (prefabs[].object holds them)
  const objectList = [];
  if (json.prefabs && Array.isArray(json.prefabs)) {
    for (const prefab of json.prefabs) {
      if (Array.isArray(prefab.object)) objectList.push(...prefab.object);
    }
  }
  // fallback: some exports put meshes directly on model[0].object
  if (objectList.length === 0 && json.model && Array.isArray(json.model[0].object)) {
    objectList.push(...json.model[0].object);
  }

  console.log('[crocotile] parsing', objectList.length, 'crocotile 3D objects');

  for (let i = 0; i < objectList.length; i++) {
    const o = objectList[i];
    const mat = makeMaterial(sharedMap, o);
    const mesh = buildCrocotileMesh(o, mat, tileX, tileY);
    if (mesh) group.add(mesh);
  }

  return group;
}

function buildCrocotileMesh(o, mat, tileX, tileY) {
  let geo;
  if (o.vertices && o.vertices.length > 0 && o.faces && o.faces.length > 0) {
    geo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const colors = [];

    for (let i = 0; i < o.faces.length; i++) {
      const face = o.faces[i];
      const faceUv = (o.uvs && o.uvs[i]) ? o.uvs[i] : [];
      const faceCol = (o.colors && o.colors[i]) ? o.colors[i] : null;
      for (let j = 0; j < face.length; j++) {
        const vIdx = face[j];
        const vert = o.vertices[vIdx];
        if (vert) positions.push(vert.x, vert.y, vert.z);
        if (faceUv[j]) uvs.push(faceUv[j].x, faceUv[j].y); else uvs.push(0, 0);
        if (faceCol) colors.push(faceCol.r ?? 1, faceCol.g ?? 1, faceCol.b ?? 1);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs.length === (positions.length / 3) * 2) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    if (colors.length === (positions.length / 3) * 3) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    geo.computeVertexNormals();
  } else {
    const type = (o.type || 'mesh').toLowerCase();
    const data = o.data || {};
    if (type === 'plane' || type === 'sprite') {
      const w = (data.width || 1) * tileX;
      const h = (data.height || 1) * tileY;
      geo = new THREE.PlaneGeometry(w, h);
    } else {
      const w = (data.x || data.width || 1) * tileX;
      const h = (data.y || data.height || 1) * tileY;
      const d = (data.z || data.depth || 1) * tileX;
      geo = new THREE.BoxGeometry(w, h, d);
    }
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'croco_mesh';
  const p = o.position || { x: 0, y: 0, z: 0 };
  mesh.position.set(p.x || 0, p.y || 0, p.z || 0);
  if (o.rotation) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(o.rotation.x || 0),
      THREE.MathUtils.degToRad(o.rotation.y || 0),
      THREE.MathUtils.degToRad(o.rotation.z || 0)
    );
  }
  if (o.scale) mesh.scale.set(o.scale.x || 1, o.scale.y || 1, o.scale.z || 1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeMaterial(sharedMap, o) {
  if (sharedMap) {
    // Use vertex colors if present, otherwise flat-shade the shared texture.
    const useVertexColors = !!(o.colors && o.colors.length);
    return new THREE.MeshStandardMaterial({
      map: sharedMap,
      vertexColors: useVertexColors,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}

export { loadCrocotile };
