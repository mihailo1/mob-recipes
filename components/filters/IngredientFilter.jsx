"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { suggestIngredients } from "../../lib/ingredients.mjs";

/**
 * Ingredient chips + autocomplete.
 * Props: selected (string[] canonical names), vocabulary (buildVocabulary()),
 * onAdd(name), onRemove(name).
 */
export default function IngredientFilter({
  selected,
  vocabulary,
  onAdd,
  onRemove,
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const suggestions = useMemo(
    () => (input.trim() ? suggestIngredients(input, vocabulary, 8, selected) : []),
    [input, vocabulary, selected],
  );

  function add(name) {
    onAdd(name);
    setInput("");
    setOpen(false);
  }

  return (
    <div className="ingredient-filter" ref={boxRef}>
      <div className="ingredient-filter-input-row">
        <input
          className="search-input"
          aria-label="Filter by ingredients"
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) {
              e.preventDefault();
              add(suggestions[0].name);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          type="text"
          placeholder="Filter by ingredients you want (e.g. chicken, lemon)…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && suggestions.length > 0 ? (
        <div className="suggestion-list">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className="suggestion-item"
              onClick={() => add(s.name)}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      {selected.length > 0 ? (
        <div className="chip-row" style={{ marginTop: 10 }}>
          {selected.map((name) => (
            <button
              key={name}
              type="button"
              className="chip chip-removable"
              onClick={() => onRemove(name)}
              title="Remove"
            >
              {name} ✕
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
