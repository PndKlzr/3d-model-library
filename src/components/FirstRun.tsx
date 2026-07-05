import type { ThemeMode } from "../lib/viewPreferences";

type FirstRunProps = {
  onChooseFolder: () => Promise<void>;
  themeMode: ThemeMode;
};

export function FirstRun({ onChooseFolder, themeMode }: FirstRunProps) {
  return (
    <main className="first-run" data-theme={themeMode}>
      <div className="first-run-panel">
        <p className="eyebrow">Primeira abertura</p>
        <h1>Escolha sua pasta de modelos</h1>
        <p>Depois disso o app vai lembrar essa pasta toda vez que abrir.</p>
        <button type="button" onClick={onChooseFolder}>
          Escolher pasta
        </button>
      </div>
    </main>
  );
}
