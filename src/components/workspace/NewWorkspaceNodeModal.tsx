import { useRef, useState } from "react";
import {
  CloseIcon as X,
} from "@solar-icons/react/linear";
import styles from "../project/ProjectModal.module.css";
import { isImeComposing } from "../../utils/ime";
import { useMotionState } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

export function NewWorkspaceNodeModal({ parentName, onClose, onCreate }: {
  parentName?: string;
  onClose: () => void;
  onCreate: (input: { name: string; description?: string }) => Promise<void>;
}) {
  const motionState = useMotionState();
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  // Some Chrome/WebKit IME paths dispatch `submit` immediately after the
  // keydown used to confirm a candidate. Remember it briefly so that a
  // Japanese conversion Enter never creates a half-composed folder name.
  const imeEnterAt = useRef(0);
  const shouldIgnoreImeSubmit = () => Date.now() - imeEnterAt.current < 120;
  return <div className={`${styles.overlay} ${motion.overlay}`} data-motion={motionState} onClick={onClose} role="presentation"><div className={`${styles.modal} ${motion.sheet}`} role="dialog" aria-labelledby="new-workspace-title" onClick={(event) => event.stopPropagation()}>
    <header className={styles.header}><h2 id="new-workspace-title" className={styles.title}>{parentName ? `「${parentName}」にサブフォルダーを追加` : "新規フォルダ"}</h2><button className={styles.closeButton} onClick={onClose} title="閉じる"><X size={18} /></button></header>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (shouldIgnoreImeSubmit()) return; if (!name.trim()) { setError("名前を入力してください"); return; } setSaving(true); setError(null); void onCreate({ name: name.trim(), description: description.trim() || undefined }).then(onClose).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "作成に失敗しました")).finally(() => setSaving(false)); }}>
      <label className={styles.label}>フォルダ名<span className={styles.inputField}><input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && isImeComposing(event)) imeEnterAt.current = Date.now(); }} placeholder="例: 関連研究" autoFocus /></span></label>
      <label className={styles.label}>説明（任意）<span className={styles.inputField}><textarea className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="このワークスペースについて" rows={3} /></span></label>
      {error && <p className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>キャンセル</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "保存中..." : "作成"}</button></div>
    </form>
  </div></div>;
}
