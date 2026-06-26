import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { useCreateKanji, useUpdateKanji, useListKanji, getListKanjiQueryKey, getGetStatsSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, SkipForward, AlertCircle, X, Loader2, RefreshCw } from "lucide-react";

interface ParsedRow {
  character: string;
  onyomi: string;
  kunyomi: string;
  korean: string;
  status: "new" | "duplicate";
  existingId?: number;
}

type ImportPhase = "idle" | "preview" | "importing" | "done";

interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export function ExcelImportKanji() {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [updateMode, setUpdateMode] = useState(false);
  const [selectedDups, setSelectedDups] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingKanji } = useListKanji();
  const createKanji = useCreateKanji();
  const updateKanji = useUpdateKanji();
  const queryClient = useQueryClient();

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

        const existingMap = new Map(existingKanji?.map(k => [k.character, k.id]) ?? []);

        const parsed: ParsedRow[] = [];
        for (const row of raw) {
          const character = String(row[0] ?? "").trim();
          if (!character) continue;

          const onyomiRaw = String(row[1] ?? "").trim();
          const kunyomiRaw = String(row[2] ?? "").trim();
          const korean = String(row[3] ?? "").trim();

          const onyomi = onyomiRaw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
            .join("\n");
          const kunyomi = kunyomiRaw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
            .join("\n");

          const existingId = existingMap.get(character);
          parsed.push({
            character,
            onyomi,
            kunyomi,
            korean,
            status: existingId !== undefined ? "duplicate" : "new",
            existingId,
          });
        }

        setRows(parsed);
        setFileName(file.name);
        setSelectedDups(new Set());
        setPhase("preview");
      } catch {
        alert("파일을 읽을 수 없습니다. 올바른 엑셀 파일인지 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [existingKanji]);

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert(".xlsx, .xls, .csv 파일만 지원합니다.");
      return;
    }
    parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const toggleDup = (character: string) => {
    setSelectedDups(prev => {
      const next = new Set(prev);
      if (next.has(character)) next.delete(character);
      else next.add(character);
      return next;
    });
  };

  const toggleAllDups = () => {
    const dupChars = rows.filter(r => r.status === "duplicate").map(r => r.character);
    if (selectedDups.size === dupChars.length) {
      setSelectedDups(new Set());
    } else {
      setSelectedDups(new Set(dupChars));
    }
  };

  const handleImport = async () => {
    const toCreate = rows.filter(r => r.status === "new");
    const toUpdate = updateMode
      ? rows.filter(r => r.status === "duplicate" && selectedDups.has(r.character))
      : [];

    const total = toCreate.length + toUpdate.length;
    if (total === 0) return;

    setPhase("importing");
    setImportProgress(0);

    let added = 0;
    let updated = 0;
    let done = 0;

    for (const row of toCreate) {
      try {
        await new Promise<void>((resolve, reject) => {
          createKanji.mutate(
            { data: { character: row.character, onyomi: row.onyomi, kunyomi: row.kunyomi, korean: row.korean } },
            { onSuccess: () => resolve(), onError: () => reject() }
          );
        });
        added++;
      } catch {
        // skip on error
      }
      done++;
      setImportProgress(done);
    }

    for (const row of toUpdate) {
      if (!row.existingId) { done++; setImportProgress(done); continue; }
      try {
        await new Promise<void>((resolve, reject) => {
          updateKanji.mutate(
            { id: row.existingId!, data: { korean: row.korean } as any },
            { onSuccess: () => resolve(), onError: () => reject() }
          );
        });
        updated++;
      } catch {
        // skip on error
      }
      done++;
      setImportProgress(done);
    }

    await queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });

    const skipped = rows.filter(r => r.status === "duplicate").length - updated;
    setResult({ added, updated, skipped });
    setPhase("done");
  };

  const handleReset = () => {
    setPhase("idle");
    setRows([]);
    setResult(null);
    setFileName("");
    setImportProgress(0);
    setSelectedDups(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const newCount = rows.filter(r => r.status === "new").length;
  const dupCount = rows.filter(r => r.status === "duplicate").length;
  const totalToImport = newCount + (updateMode ? selectedDups.size : 0);

  return (
    <div className="border-t pt-6 mt-2">
      <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4" />
        엑셀 파일로 일괄 가져오기
      </p>

      {/* IDLE: drop zone */}
      {phase === "idle" && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
            }`}
        >
          <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">파일을 드래그하거나 클릭해서 선택</p>
          <p className="text-xs text-muted-foreground mt-1">.xlsx · .xls · .csv 지원</p>
          <p className="text-xs text-muted-foreground mt-3 border-t pt-2">
            열 순서: 한자 · 음독 · 훈독 · 한국어 뜻<br />
            음독/훈독이 여러 개이면 콤마(,)로 구분
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* PREVIEW: show parsed rows */}
      {phase === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground truncate max-w-[200px]">{fileName}</span>
            <button onClick={handleReset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-3 text-sm flex-wrap">
            <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> 신규 {newCount}개
            </span>
            {dupCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <SkipForward className="h-3.5 w-3.5" /> 중복 {dupCount}개
              </span>
            )}
          </div>

          {/* Update mode toggle — only show if there are duplicates */}
          {dupCount > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none rounded-lg border px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={updateMode}
                onChange={e => {
                  setUpdateMode(e.target.checked);
                  if (!e.target.checked) setSelectedDups(new Set());
                }}
                className="accent-primary h-4 w-4"
              />
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>중복 항목도 업데이트 <span className="text-muted-foreground">(한국어 뜻 덮어쓰기)</span></span>
            </label>
          )}

          {/* Select all duplicates button when update mode is on */}
          {updateMode && dupCount > 0 && (
            <button
              onClick={toggleAllDups}
              className="text-xs text-primary hover:underline text-left"
            >
              {selectedDups.size === dupCount ? "중복 전체 해제" : "중복 전체 선택"}
            </button>
          )}

          {rows.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border text-xs">
              <table className="w-full">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    {updateMode && <th className="px-2 py-2 w-6"></th>}
                    <th className="text-left px-3 py-2 font-medium">한자</th>
                    <th className="text-left px-3 py-2 font-medium">음독</th>
                    <th className="text-left px-3 py-2 font-medium">훈독</th>
                    <th className="text-left px-3 py-2 font-medium">뜻</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isDup = row.status === "duplicate";
                    const isSelected = isDup && selectedDups.has(row.character);
                    const dimmed = isDup && !isSelected;
                    return (
                      <tr
                        key={i}
                        className={`border-t transition-opacity ${dimmed ? "opacity-40" : ""} ${updateMode && isDup ? "cursor-pointer hover:bg-muted/30" : ""}`}
                        onClick={() => { if (updateMode && isDup) toggleDup(row.character); }}
                      >
                        {updateMode && (
                          <td className="px-2 py-2">
                            {isDup && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDup(row.character)}
                                onClick={e => e.stopPropagation()}
                                className="accent-primary h-3.5 w-3.5"
                              />
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 font-serif font-semibold text-base">{row.character}</td>
                        <td className="px-3 py-2 font-serif">{row.onyomi.replace(/\n/g, ", ")}</td>
                        <td className="px-3 py-2 font-serif">{row.kunyomi.replace(/\n/g, ", ")}</td>
                        <td className="px-3 py-2">{row.korean}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {isDup
                            ? isSelected
                              ? <span className="text-blue-600 dark:text-blue-400 font-medium">업데이트</span>
                              : <span className="text-muted-foreground">중복</span>
                            : <span className="text-green-600 dark:text-green-400 font-medium">신규</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm flex items-center gap-2 justify-center">
              <AlertCircle className="h-4 w-4" />
              데이터가 없습니다. 파일을 확인해주세요.
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="flex-1">
              취소
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleImport}
              disabled={totalToImport === 0}
            >
              {totalToImport === 0
                ? "가져올 항목 없음"
                : `${totalToImport}개 ${newCount > 0 && selectedDups.size > 0 ? "추가/업데이트" : newCount > 0 ? "가져오기" : "업데이트"}`
              }
            </Button>
          </div>
        </div>
      )}

      {/* IMPORTING: progress */}
      {phase === "importing" && (
        <div className="text-center py-6 space-y-3">
          <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            처리 중... {importProgress} / {newCount + (updateMode ? selectedDups.size : 0)}
          </p>
        </div>
      )}

      {/* DONE: results */}
      {phase === "done" && result && (
        <div className="space-y-3">
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm">
            <p className="font-medium text-green-800 dark:text-green-300 mb-1">완료</p>
            <div className="flex gap-4 flex-wrap text-green-700 dark:text-green-400">
              {result.added > 0 && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {result.added}개 추가됨
                </span>
              )}
              {result.updated > 0 && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" /> {result.updated}개 업데이트됨
                </span>
              )}
              {result.skipped > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <SkipForward className="h-3.5 w-3.5" /> {result.skipped}개 건너뜀
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleReset}>
            다른 파일 가져오기
          </Button>
        </div>
      )}
    </div>
  );
}
