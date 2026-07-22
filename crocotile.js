// crocotile.js — loader for Crocotile 3D .crocotile JSON assets
// Parses the real asset format exported by Crocotile 3D and builds Three.js meshes.
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
      opts.onSkybox && opts.onSkybox(tex);
    });
  }

  // 2. Extract shared materials from json.model
  const modelMaterials = (json.model || []).map((m) => makeMaterial(m.material, m.texture));

  // 3. Extract all objects from prefabs, objects, or model arrays
  const objectList = [];
  if (json.prefabs && Array.isArray(json.prefabs)) {
    for (const prefab of json.prefabs) {
      if (prefab.object && Array.isArray(prefab.object)) {
        objectList.push(...prefab.object);
      }
    }
  }
  if (json.objects && Array.isArray(json.objects)) {
    objectList.push(...json.objects);
  }
  if (objectList.length === 0 && json.model && Array.isArray(json.model)) {
    objectList.push(...json.model);
  }

  console.log('[crocotile] parsing', objectList.length, 'crocotile 3D objects');

  for (let i = 0; i < objectList.length; i++) {
    const o = objectList[i];
    const sharedMat = (o.texture !== undefined && modelMaterials[o.texture])
      ? modelMaterials[o.texture]
      : makeMaterial(o.material || {}, o.texture);

    const mesh = buildCrocotileMesh(o, sharedMat, tileX, tileY);
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

    for (let i = 0; i < o.faces.length; i++) {
      const face = o.faces[i];
      const faceUv = (o.uvs && o.uvs[i]) ? o.uvs[i] : [];

      for (let j = 0; j < face.length; j++) {
        const vIdx = face[j];
        const vert = o.vertices[vIdx];
        if (vert) {
          positions.push(vert.x, vert.y, vert.z);
        }
        if (faceUv[j]) {
          // Crocotile UVs are normalized [0, 1]
          uvs.push(faceUv[j].x, faceUv[j].y);
        } else {
          uvs.push(0, 0);
        }
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs.length === (positions.length / 3) * 2) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

  if (o.scale) {
    mesh.scale.set(o.scale.x || 1, o.scale.y || 1, o.scale.z || 1);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeMaterial(mat = {}, textureData) {
  const mapSource = (mat && mat.map) || (typeof textureData === 'string' ? textureData : null);
  if (mapSource && typeof mapSource === 'string' && mapSource.startsWith('data:image')) {
    const tex = new THREE.TextureLoader().load(mapSource);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
  }

  const c = mat && mat.color !== undefined ? mat.color : 0x8899aa;
  const color = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: mat.roughness ?? 0.8,
    metalness: mat.metalness ?? 0.1,
    transparent: !!mat.transparent,
    opacity: mat.opacity ?? 1.0,
    side: THREE.DoubleSide,
  });
}

export { loadCrocotile };
