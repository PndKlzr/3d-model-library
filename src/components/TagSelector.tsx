import { Plus, Search, Tag } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type TagSelectorProps = {
  selectedTags: string[];
  availableTags: string[];
  onChange: (tags: string[]) => Promise<void> | void;
  label?: string;
  placeholder?: string;
};

export function TagSelector({
  selectedTags,
  availableTags,
  onChange,
  label = "Tags",
  placeholder = "Buscar ou criar tag"
}: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const normalizedSelectedTags = useMemo(() => normalizeTags(selectedTags), [selectedTags]);
  const selectedTagSet = new Set(normalizedSelectedTags);
  const normalizedAvailableTags = useMemo(
    () => normalizeTags([...availableTags, ...selectedTags]),
    [availableTags, selectedTags]
  );
  const normalizedQuery = normalizeTag(query);
  const visibleTags = normalizedAvailableTags.filter((tag) => tag.includes(normalizedQuery));
  const canCreateTag =
    normalizedQuery.length > 0 && !normalizedAvailableTags.includes(normalizedQuery);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (
        selectorRef.current &&
        event.target instanceof Node &&
        !selectorRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen]);

  async function toggleTag(tag: string) {
    if (selectedTagSet.has(tag)) {
      await onChange(normalizedSelectedTags.filter((selectedTag) => selectedTag !== tag));
    } else {
      await onChange(normalizeTags([...normalizedSelectedTags, tag]));
    }
  }

  async function createTag() {
    if (!canCreateTag) {
      return;
    }

    await onChange(normalizeTags([...normalizedSelectedTags, normalizedQuery]));
    setQuery("");
    setIsOpen(true);
  }

  return (
    <div className="tag-selector" ref={selectorRef}>
      <span className="tag-selector-label">
        <Tag size={15} />
        {label}
      </span>
      <button
        className="tag-selector-trigger"
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
      >
        {normalizedSelectedTags.length > 0 ? (
          <span className="tag-selector-chips">
            {normalizedSelectedTags.map((tag) => (
              <em key={tag}>{tag}</em>
            ))}
          </span>
        ) : (
          <span className="tag-selector-empty">Selecionar tags</span>
        )}
      </button>
      {isOpen ? (
        <div
          className="tag-selector-popover"
          role="listbox"
          id={listboxId}
          aria-label={label}
          aria-multiselectable="true"
        >
          <label className="tag-selector-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createTag();
                }
              }}
              placeholder={placeholder}
            />
          </label>
          <div className="tag-selector-options">
            {visibleTags.length > 0 ? (
              visibleTags.map((tag) => (
                <div
                  className="tag-selector-option"
                  key={tag}
                  role="option"
                  aria-selected={selectedTagSet.has(tag)}
                  tabIndex={0}
                  onClick={() => void toggleTag(tag)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void toggleTag(tag);
                    }
                  }}
                >
                  <input
                    className="tag-selector-checkbox"
                    type="checkbox"
                    checked={selectedTagSet.has(tag)}
                    readOnly
                    tabIndex={-1}
                  />
                  <span>{tag}</span>
                </div>
              ))
            ) : (
              <span className="tag-selector-no-results">Nenhuma tag encontrada.</span>
            )}
          </div>
          {canCreateTag ? (
            <button className="tag-selector-create" type="button" onClick={() => void createTag()}>
              <Plus size={15} />
              Criar tag "{normalizedQuery}"
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))].sort();
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}
