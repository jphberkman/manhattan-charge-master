"use client";

import { useEditMode } from "@/lib/contexts/edit-mode-context";
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface EditableTextProps {
  contentKey: string;
  defaultValue: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  className?: string;
  /** If true, renders a multi-line textarea instead of a single-line input */
  multiline?: boolean;
}

export function EditableText({
  contentKey,
  defaultValue,
  as = "span",
  className = "",
  multiline = false,
}: EditableTextProps) {
  const { editMode, content, updateContent } = useEditMode();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const displayValue = content[contentKey] ?? defaultValue;

  // When entering edit mode on this element, seed local value
  useEffect(() => {
    if (editing) {
      setLocalValue(displayValue);
    }
  }, [editing, displayValue]);

  // Auto-focus and auto-size when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      if (inputRef.current instanceof HTMLTextAreaElement) {
        autoSize(inputRef.current);
      }
    }
  }, [editing]);

  const save = useCallback(async () => {
    setEditing(false);
    if (localValue !== displayValue) {
      try {
        await updateContent(contentKey, localValue);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch {
        // updateContent already reverts optimistically
      }
    }
  }, [localValue, displayValue, contentKey, updateContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (multiline) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      } else {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }
    },
    [multiline, save],
  );

  // Normal mode: render plain element
  if (!editMode) {
    return createElement(as, { className }, displayValue);
  }

  // Edit mode but not actively editing: show clickable text with border
  if (!editing) {
    return createElement(
      as,
      {
        className: `${className} cursor-pointer rounded transition-all hover:outline-dashed hover:outline-2 hover:outline-violet-400 hover:outline-offset-2`,
        onClick: () => setEditing(true),
        title: "Click to edit",
      },
      <>
        {displayValue}
        {saved && (
          <span className="ml-2 inline-block animate-pulse text-xs font-normal text-emerald-400">
            Saved
          </span>
        )}
      </>,
    );
  }

  // Actively editing: show input/textarea
  const inputProps = {
    ref: inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
    value: localValue,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setLocalValue(e.target.value);
      if (e.target instanceof HTMLTextAreaElement) {
        autoSize(e.target);
      }
    },
    onBlur: save,
    onKeyDown: handleKeyDown,
    className: `${className} w-full rounded border-2 border-violet-500 bg-white/10 px-2 py-1 outline-none ring-2 ring-violet-500/30`,
    style: { minWidth: "100px" },
  };

  if (multiline) {
    return (
      <textarea
        {...(inputProps as React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref: React.RefObject<HTMLTextAreaElement> })}
        rows={2}
      />
    );
  }

  return <input type="text" {...(inputProps as React.InputHTMLAttributes<HTMLInputElement> & { ref: React.RefObject<HTMLInputElement> })} />;
}

function autoSize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
