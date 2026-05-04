import { Upload, FolderOpen } from "lucide-react";

export function SourcePickerStep({
  onPickDevice,
  onPickLibrary,
}: {
  onPickDevice: (file: File) => void;
  onPickLibrary: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-hairline bg-card p-6 text-center transition hover:border-primary hover:bg-secondary/40">
        <Upload className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
        <div>
          <div className="text-sm font-medium text-ink">From Device</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Upload .xlsx, .csv or .pdf
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.txt"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickDevice(f);
          }}
        />
      </label>
      <button
        type="button"
        onClick={onPickLibrary}
        className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-card p-6 text-center transition hover:border-primary hover:bg-secondary/40"
      >
        <FolderOpen className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
        <div>
          <div className="text-sm font-medium text-ink">From Library</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Pick a file you already uploaded
          </div>
        </div>
      </button>
    </div>
  );
}
