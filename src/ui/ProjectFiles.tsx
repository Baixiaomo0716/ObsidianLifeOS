import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { AttachmentReferenceDraft } from "../services/attachment-reference-service";
import type { ProjectFileRow, ProjectFileService } from "../services/project-file-service";
export interface ProjectFilesPort { service: ProjectFileService; upload: (id: string) => void; open: (path: string) => Promise<void>; active: () => boolean }
function FileRow({ row, source, port, refresh }: { row: ProjectFileRow; source: Snapshot; port: ProjectFilesPort; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), draft = useRef<AttachmentReferenceDraft | null>(null), running = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (remove: boolean) => {
    if (running.current || !port.active()) return; running.current = true; setBusy(true);
    try {
      if (remove) { draft.current ??= await port.service.prepareRemove(source, row.path); await port.service.executeRemove(draft.current); }
      else await port.open(await port.service.open(source, row.path));
      if (mounted.current && port.active()) { setMessage(remove ? "已移出项目，文件仍保留" : "已打开"); if (remove) refresh(); }
    } catch (error) { if (mounted.current && port.active()) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  return <article className="lifeos-module-row"><strong>{row.info?.名称 ?? row.path.split("/").pop()}</strong><p>{row.info ? `${row.info.字节数} 字节 · ${row.info.类型 || "未知类型"} · ${row.info.导入时间}` : "文件未通过核验"}</p><small>{row.path}</small>{row.error && <p role="status">{row.error}</p>}<button disabled={busy || !!row.error || !!draft.current} onClick={() => { void run(false); }}>打开文件</button><button disabled={busy} onClick={() => { void run(true); }}>{draft.current ? "重试移出" : "移出项目"}</button><p role="status">{message}</p></article>;
}
export function ProjectFiles({ source, port }: { source: Snapshot; port: ProjectFilesPort }) {
  const [rows, setRows] = useState<ProjectFileRow[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, refresh] = useState(0);
  useEffect(() => {
    let mounted = true; setLoading(true); setError("");
    void port.service.list(source).then((value) => { if (mounted && port.active()) setRows(value); }).catch((value: unknown) => { if (mounted && port.active()) { setRows([]); setError(value instanceof Error ? value.message : String(value)); } }).finally(() => { if (mounted && port.active()) setLoading(false); });
    return () => { mounted = false; };
  }, [source.path, source.version.original, port.service, revision]);
  return <section aria-label="项目文件"><h4>项目文件</h4><button onClick={() => port.upload(String(source.attributes.biaoshi))}>上传文件</button><button disabled={loading} onClick={() => refresh((n) => n + 1)}>刷新 / 重试核验</button><p>移出仅解除项目关联，文件会保留。</p>{loading ? <p>正在核验文件…</p> : error ? <p role="status">{error}</p> : <div className="lifeos-relation-results" role="region" aria-label="附件列表" tabIndex={0}>{rows.map((row) => <FileRow key={`${source.version.original}:${row.path}`} row={row} source={source} port={port} refresh={() => refresh((n) => n + 1)} />)}{!rows.length && <p>暂无附件。</p>}</div>}</section>;
}
