// Share one decoded model between the controls and the scene.
let modelPromise;
export function loadModel() {
  return modelPromise ??= (async () => {
    const response = await fetch(new URL('../data/model.json.gz?v=p0520261102_8918d9c5', import.meta.url));
    if (!response.ok) throw new Error('No se pudo cargar la geometría actualizada.');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
  })();
}
