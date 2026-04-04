"use client";

import { useEditMode } from "@/lib/contexts/edit-mode-context";
import { Pencil, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function EditModeToggle() {
  const { editMode, isAdmin, toggleEditMode } = useEditMode();
  const router = useRouter();

  if (!isAdmin) return null;

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-between bg-gradient-to-r from-violet-900/90 to-violet-800/90 px-4 py-2 text-sm text-white">
      <div className="flex items-center gap-2">
        <Pencil className="size-3.5 text-violet-300" />
        <span className="font-medium">
          Admin mode
          <span className="ml-1 font-normal text-white/60">
            {editMode
              ? "— click any highlighted text to edit"
              : "— editing paused"}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleEditMode}
          className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/10"
        >
          {editMode ? "Pause editing" : "Resume editing"}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/10"
        >
          <LogOut className="size-3" />
          Exit admin
        </button>
      </div>
    </div>
  );
}
