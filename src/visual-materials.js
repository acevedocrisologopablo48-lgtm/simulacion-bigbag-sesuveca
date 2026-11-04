// Deterministic, local surface finishes for the existing CAD and context models.
export function createVisualMaterials(THREE, renderer) {
  const textures = [];
  const materials = new Set();
  const painted = new Map();
  let seed = 20361104;

  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function canvasTexture(width, height, draw, repeat = [1, 1], color = true) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    textures.push(texture);
    return texture;
  }

  const weave = canvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = '#e9e7dc';
    context.fillRect(0, 0, width, height);
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const shade = 218 + Math.floor(random() * 18);
        context.fillStyle = `rgb(${shade},${shade},${shade - 7})`;
        context.fillRect(x, y, 3, 1);
        context.fillRect(x + 2, y + 1, 1, 3);
        context.fillStyle = 'rgba(255,255,250,.32)';
        context.fillRect(x, y + 1, 2, 1);
      }
    }
    // Wider sewn panel joins remain quiet at the general-view scale.
    context.strokeStyle = 'rgba(128,130,120,.18)';
    context.lineWidth = 2;
    context.strokeRect(4, 0, width - 8, height);
  }, [6, 8]);

  const weaveBump = weave.clone();
  weaveBump.colorSpace = THREE.NoColorSpace;
  textures.push(weaveBump);

  const woodMap = canvasTexture(256, 512, (context, width, height) => {
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const grain = Math.sin(x * .23 + Math.sin(y * .014) * 2.6) * 7;
        const fine = Math.sin(x * 1.38 + Math.sin(y * .04)) * 2;
        const noise = (random() - .5) * 13;
        const shade = grain + fine + noise;
        const offset = (y * width + x) * 4;
        pixels.data[offset] = 169 + shade;
        pixels.data[offset + 1] = 133 + shade;
        pixels.data[offset + 2] = 88 + shade;
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    context.strokeStyle = 'rgba(75,56,34,.16)';
    context.lineWidth = 1;
    for (let x = 11; x < width; x += 43) {
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x - 2, 170, x + 3, 350, x, height);
      context.stroke();
    }
  }, [1, 2]);

  const concreteMap = canvasTexture(512, 512, (context, width, height) => {
    const pixels = context.createImageData(width, height);
    for (let index = 0; index < width * height; index++) {
      const x = index % width;
      const y = Math.floor(index / width);
      const mottling = Math.sin(x * .031) * Math.sin(y * .027) * 3;
      const shade = 160 + mottling + (random() - .5) * 13;
      const offset = index * 4;
      pixels.data[offset] = shade;
      pixels.data[offset + 1] = shade + 2;
      pixels.data[offset + 2] = shade + 1;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [14, 14]);

  const concreteBump = concreteMap.clone();
  concreteBump.colorSpace = THREE.NoColorSpace;
  textures.push(concreteBump);

  const room = new THREE.Scene();
  room.background = new THREE.Color('#d4dde2');
  const roomMaterial = new THREE.MeshBasicMaterial({ color: '#bac4cb', side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), roomMaterial);
  room.add(shell);
  const panelMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(11, 8), panelMaterial);
  ceiling.position.set(-3, -2, 10);
  room.add(ceiling);
  const windowPanel = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), panelMaterial);
  windowPanel.rotation.x = Math.PI / 2;
  windowPanel.position.set(-3, -10, 4);
  room.add(windowPanel);
  const fillPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), panelMaterial);
  fillPanel.rotation.y = Math.PI / 2;
  fillPanel.position.set(10, 4, 4);
  room.add(fillPanel);
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentTarget = generator.fromScene(room, .04);
  const environment = environmentTarget.texture;
  generator.dispose();
  room.traverse(object => object.geometry?.dispose());
  roomMaterial.dispose();
  panelMaterial.dispose();

  function standard(options) {
    const material = new THREE.MeshStandardMaterial({ envMap: environment, side: THREE.DoubleSide, ...options });
    materials.add(material);
    return material;
  }

  const steel = standard({ color: '#9ea7ad', metalness: .82, roughness: .39, envMapIntensity: .9 });
  const galvanized = standard({ color: '#c5ccd0', metalness: .75, roughness: .5, envMapIntensity: .8 });
  const rubber = standard({ color: '#252b2d', metalness: 0, roughness: .9 });
  const wood = standard({ color: '#e8d3b1', map: woodMap, metalness: 0, roughness: .86 });
  const cloth = standard({ color: '#fffdf3', map: weave, bumpMap: weaveBump, bumpScale: .00065, metalness: 0, roughness: .96 });
  const concrete = standard({ color: '#d2d3d0', map: concreteMap, bumpMap: concreteBump, bumpScale: .003, metalness: 0, roughness: .95 });

  return {
    paint(color) {
      const value = color?.isColor ? color : new THREE.Color(color);
      const key = value.getHexString();
      if (!painted.has(key)) {
        const material = new THREE.MeshPhysicalMaterial({
          color: value,
          roughness: .42,
          metalness: .24,
          clearcoat: .16,
          clearcoatRoughness: .5,
          envMap: environment,
          envMapIntensity: .72,
          side: THREE.DoubleSide,
        });
        painted.set(key, material);
        materials.add(material);
      }
      return painted.get(key);
    },
    steel,
    galvanized,
    rubber,
    wood,
    cloth,
    concrete,
    environment,
    dispose() {
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      environmentTarget.dispose();
    },
  };
}
