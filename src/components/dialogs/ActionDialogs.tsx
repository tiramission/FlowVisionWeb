import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'

/** 文件名非法字符（Windows 保留） */
const ILLEGAL = /[\\/:*?"<>|]/

/** 重命名 / 删除确认对话框 + 轻提示，挂在 App 根部 */
export function ActionDialogs() {
  const renameTarget = useAppStore(s => s.renameTarget)
  const deleteTarget = useAppStore(s => s.deleteTarget)
  const toast = useAppStore(s => s.toast)
  const setRenameTarget = useAppStore(s => s.setRenameTarget)
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget)
  const renameInCurrent = useAppStore(s => s.renameInCurrent)
  const deleteInCurrent = useAppStore(s => s.deleteInCurrent)

  const [name, setName] = useState('')

  useEffect(() => {
    setName(renameTarget?.name ?? '')
  }, [renameTarget])

  const trimmed = name.trim()
  const nameValid = trimmed.length > 0 && trimmed !== renameTarget?.name && !ILLEGAL.test(trimmed)

  const submitRename = () => {
    if (!renameTarget || !nameValid) return
    const target = renameTarget
    setRenameTarget(null)
    void renameInCurrent(target, trimmed)
  }

  const submitDelete = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    void deleteInCurrent(target)
  }

  return (
    <>
      <Dialog open={renameTarget !== null} onOpenChange={open => { if (!open) setRenameTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>输入新名称，回车确认</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            spellCheck={false}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') submitRename()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button disabled={!nameValid} onClick={submitRename}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除「{deleteTarget?.name}」？</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'folder' ? '文件夹及其全部内容将被删除。' : '该文件将被删除。'}此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={submitDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          className={`pointer-events-none fixed bottom-12 left-1/2 z-[70] -translate-x-1/2 rounded-md px-4 py-2 text-sm text-white shadow-lg ${toast.kind === 'error' ? 'bg-destructive' : 'bg-foreground'}`}
        >
          {toast.text}
        </div>
      )}
    </>
  )
}
