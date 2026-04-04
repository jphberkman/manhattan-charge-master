"use client";

import { useEditMode } from "@/lib/contexts/edit-mode-context";
import { Pencil, X } from "lucide-react";

export function EditModeToggle() {
  const { editMode, toggleEditMode } = useEditMode();

  return (
    <>
      {/* Banner at top when edit mode is on */}
      {editMode && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <Pencil className="size-3.5" />
          Edit mode — click any highlighted text to edit
          <button
            onClick={toggleEditMode}
            className="ml-3 rounded-full bg-white/20 p-0.5 transition hover:bg-white/30"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={toggleEditMode}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-all ${
          editMode
            ? "bg-violet-600 text-white ring-4 ring-violet-400/40"
            : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
        }`}
        title={editMode ? "Exit edit mode" : "Enter edit mode"}
      >
        <Pencil className="size-4" />
        {editMode ? "Editing" : "Edit"}
      </button>
    </>
  );
}
