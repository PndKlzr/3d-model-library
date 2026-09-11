import { ChevronDown, Files } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SUPPORTED_FILE_EXTENSIONS,
  type SupportedFileExtension
} from "../shared/fileCapabilities";

type FileTypeFilterProps = {
  visibleExtensions: ReadonlySet<SupportedFileExtension>;
  onChange: (visibleExtensions: ReadonlySet<SupportedFileExtension>) => void;
};

const FILE_TYPE_CATEGORIES: Array<{
  label: string;
  extensions: Array<{ extension: SupportedFileExtension; label: string }>;
}> = [
  {
    label: "Modelos",
    extensions: [
      { extension: ".stl", label: "STL" },
      { extension: ".3mf", label: "3MF" },
      { extension: ".obj", label: "OBJ" }
    ]
  },
  {
    label: "Imagens",
    extensions: [
      { extension: ".png", label: "PNG" },
      { extension: ".jpg", label: "JPG" },
      { extension: ".jpeg", label: "JPEG" },
      { extension: ".webp", label: "WebP" }
    ]
  },
  {
    label: "Arquivos compactados",
    extensions: [
      { extension: ".zip", label: "ZIP" },
      { extension: ".rar", label: "RAR" },
      { extension: ".7z", label: "7Z" }
    ]
  }
];

export function FileTypeFilter({ visibleExtensions, onChange }: FileTypeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function emit(nextValues: Set<SupportedFileExtension>) {
    onChange(new Set(SUPPORTED_FILE_EXTENSIONS.filter((extension) => nextValues.has(extension))));
  }

  function toggleExtension(extension: SupportedFileExtension) {
    const nextValues = new Set(visibleExtensions);
    if (nextValues.has(extension)) nextValues.delete(extension);
    else nextValues.add(extension);
    emit(nextValues);
  }

  function toggleCategory(extensions: readonly SupportedFileExtension[]) {
    const nextValues = new Set(visibleExtensions);
    const isChecked = extensions.every((extension) => nextValues.has(extension));
    extensions.forEach((extension) => isChecked
      ? nextValues.delete(extension)
      : nextValues.add(extension));
    emit(nextValues);
  }

  return (
    <div className="file-type-filter" ref={wrapRef}>
      <button
        className={`file-type-trigger ${visibleExtensions.size < SUPPORTED_FILE_EXTENSIONS.length ? "active" : ""}`}
        type="button"
        aria-label="Filtrar tipos de arquivo"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Files size={14} />
        Tipos
        <span>{visibleExtensions.size}/{SUPPORTED_FILE_EXTENSIONS.length}</span>
        <ChevronDown size={13} />
      </button>
      {isOpen ? (
        <div className="file-type-popover" role="dialog" aria-label="Tipos de arquivo">
          <strong>Tipos de arquivo</strong>
          {FILE_TYPE_CATEGORIES.map((category) => {
            const categoryExtensions = category.extensions.map(({ extension }) => extension);
            const checkedCount = categoryExtensions.filter((extension) =>
              visibleExtensions.has(extension)
            ).length;
            const isChecked = checkedCount === categoryExtensions.length;
            const isMixed = checkedCount > 0 && !isChecked;

            return (
              <fieldset key={category.label}>
                <label className="file-type-category">
                  <MixedCheckbox
                    checked={isChecked}
                    mixed={isMixed}
                    ariaLabel={category.label}
                    onChange={() => toggleCategory(categoryExtensions)}
                  />
                  <strong>{category.label}</strong>
                </label>
                <div className="file-type-options">
                  {category.extensions.map(({ extension, label }) => (
                    <label key={extension}>
                      <input
                        type="checkbox"
                        checked={visibleExtensions.has(extension)}
                        onChange={() => toggleExtension(extension)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {visibleExtensions.size === 0 ? (
            <p className="file-type-empty" role="status">Todos os tipos estão ocultos</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MixedCheckbox({
  checked,
  mixed,
  ariaLabel,
  onChange
}: {
  checked: boolean;
  mixed: boolean;
  ariaLabel: string;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      aria-checked={mixed ? "mixed" : checked}
      onChange={onChange}
    />
  );
}
