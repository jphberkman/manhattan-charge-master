"use client";

import { useEditMode } from "@/lib/contexts/edit-mode-context";
import { Pencil, LogOut, Eye, EyeOff } from "lucide-react";

export function EditModeToggle() {
  const { editMode, isAdmin, toggleEditMode } = useEditMode();

  if (!isAdmin) return null;

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.reload();
  };

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-between bg-violet-700 px-4 py-2 text-sm text-white shadow-lg">
      <div className="flex items-center gap-2">
        <Pencil className="size-3.5" />
        <span className="font-semibold">Editing live site</span>
        <span className="font-normal text-violet-200">
          {editMode
            ? "— click any text with a dashed border to edit. Changes save instantly."
            : "— editing paused. Click Resume to continue."}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleEditMode}
          className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
        >
          {editMode ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {editMode ? "Pause" : "Resume"}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-red-500/80 hover:border-red-500"
        >
          <LogOut className="size-3" />
          Sign out
        </button>
      </div>
    </div>
  );
}
