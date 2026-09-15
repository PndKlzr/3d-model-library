import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { resolveAppLocale, translate } from "../i18n/translate";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app-error-boundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const locale = resolveAppLocale(navigator.language);
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

    return (
      <main className="app-error-screen" role="alert">
        <section>
          <AlertTriangle size={34} />
          <p className="eyebrow">{t("errorBoundary.eyebrow")}</p>
          <h1>{t("errorBoundary.title")}</h1>
          <p>{t("errorBoundary.description")}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} />
            {t("common.reload")}
          </button>
        </section>
      </main>
    );
  }
}
