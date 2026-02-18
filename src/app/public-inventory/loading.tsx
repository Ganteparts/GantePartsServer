export default function PublicInventoryLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-8 py-10 text-center shadow-2xl shadow-black/40">
        <p className="text-xs uppercase tracking-[0.4em] text-emerald-400">Cargando el inventario</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">Preparando piezas filtradas...</h1>
        <p className="mt-3 text-sm text-slate-400">
          Esta vista muestra solo las piezas publicadas en Mercado Libre o pendientes por subir. Aguarda un momento mientras traemos los datos.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-emerald-400" />
          <span>Sincronizando</span>
        </div>
      </div>
    </div>
  );
}
