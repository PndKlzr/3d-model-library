import { useEffect, useState } from "react";
import type { AppSettings } from "./shared/types";

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    window.modelLibrary
      .getSettings()
      .then((loadedSettings) => {
        if (isMounted) {
          setSettings(loadedSettings);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <main className="first-run">
        <div>
          <p className="eyebrow">Carregando</p>
          <h1>Preparando biblioteca</h1>
        </div>
      </main>
    );
  }

  if (!settings?.libraryPath) {
    return (
      <main className="first-run">
        <div className="first-run-panel">
          <p className="eyebrow">Primeira abertura</p>
          <h1>Escolha sua pasta de modelos</h1>
          <p>Depois disso o app vai lembrar essa pasta toda vez que abrir.</p>
          <button
            type="button"
            onClick={async () => {
              const libraryPath = await window.modelLibrary.chooseLibraryFolder();

              if (!libraryPath || !settings) {
                return;
              }

              const savedSettings = await window.modelLibrary.saveSettings({
                ...settings,
                libraryPath
              });

              setSettings(savedSettings);
            }}
          >
            Escolher pasta
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Pastas da biblioteca">
        <div className="brand-block">
          <span className="brand-mark">3D</span>
          <div>
            <h1>Model Library</h1>
            <p>Biblioteca local</p>
          </div>
        </div>

        <div className="sidebar-section">
          <button className="folder-row selected" type="button">
            Todos os modelos
          </button>
          <button className="folder-row" type="button">
            Subpastas em breve
          </button>
        </div>
      </aside>

      <section className="library-panel" aria-label="Modelos encontrados">
        <header className="toolbar">
          <div>
            <p className="eyebrow">STL / 3MF</p>
            <h2>Sua biblioteca visual</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Atualizar biblioteca">
            ↻
          </button>
        </header>

        <div className="search-box" aria-label="Busca">
          <input placeholder="Buscar por nome ou pasta" />
        </div>

        <div className="model-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <article className="model-card" key={index}>
              <div className="model-thumb">
                <span>Preview</span>
              </div>
              <div className="model-card-meta">
                <strong>Modelo exemplo {index + 1}</strong>
                <span>.stl</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="details-panel" aria-label="Detalhes do modelo">
        <div className="preview-stage">
          <span>Visualizador 3D</span>
        </div>
        <div className="details-content">
          <p className="eyebrow">Selecionado</p>
          <h2>Nenhum modelo selecionado</h2>
          <p>Selecione um arquivo para ver dimensões, data, pasta e abrir no slicer.</p>
        </div>
      </aside>
    </main>
  );
}

export default App;
