import { useEffect, useId, useMemo, useRef, useState } from "react";

const MAX_RESULTS = 80;

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  required = false,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? options.filter((option) => option.toLowerCase().includes(term))
      : options;
    return list.slice(0, MAX_RESULTS);
  }, [options, query]);

  const totalMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options.length;
    return options.filter((option) => option.toLowerCase().includes(term)).length;
  }, [options, query]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery(value);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [value]);

  function selectOption(option) {
    onChange(option);
    setQuery(option);
    setOpen(false);
  }

  function onInputChange(event) {
    const next = event.target.value;
    setQuery(next);
    setOpen(true);
    if (value && next !== value) {
      onChange("");
    }
  }

  function onInputFocus() {
    setOpen(true);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={onInputChange}
        onFocus={onInputFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required && !value}
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={option === value ? "is-selected" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {option}
              </button>
            </li>
          ))}
          {totalMatches > MAX_RESULTS ? (
            <li className="searchable-select-hint">
              {totalMatches - MAX_RESULTS} more — keep typing to narrow
            </li>
          ) : null}
        </ul>
      ) : null}
      {open && query.trim() && filtered.length === 0 ? (
        <div className="searchable-select-empty">No products found</div>
      ) : null}
    </div>
  );
}
