type FirstRunProps = {
  onChooseFolder: () => Promise<void>;
};

export function FirstRun({ onChooseFolder }: FirstRunProps) {
  return (
    <main className="first-run">
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
