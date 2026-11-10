let modelPromise;
export function loadModel() {
  return modelPromise ??= (async () => {
    const response = await fetch(new URL('../data/model.json.gz?v=ensambles', import.meta.url));
    if (!response.ok) throw new Error('No se pudo cargar el modelo 3D.');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  })();
}
