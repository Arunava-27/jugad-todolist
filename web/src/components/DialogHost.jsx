import { useState, useEffect, useRef } from 'react';
import { registerDialogHost } from '../lib/dialogs.js';

export default function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    registerDialogHost(setDialog);
    return () => registerDialogHost(null);
  }, []);

  useEffect(() => {
    if (dialog?.type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [dialog]);

  if (!dialog) return null;

  function resolve(value) {
    dialog.resolve(value);
    setDialog(null);
  }

  function cancelValue() {
    return dialog.type === 'prompt' ? null : false;
  }

  function submit(e) {
    e.preventDefault();
    resolve(dialog.type === 'prompt' ? inputRef.current.value : true);
  }

  return (
    <div className="modal-scrim" onClick={() => resolve(cancelValue())}>
      <form className="dialog-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{dialog.title}</h3>
        <p>{dialog.message}</p>
        {dialog.type === 'prompt' && (
          <input ref={inputRef} defaultValue={dialog.defaultValue} />
        )}
        <div className="dialog-actions">
          {dialog.type !== 'alert' && (
            <button type="button" className="ghost" onClick={() => resolve(cancelValue())}>Cancel</button>
          )}
          <button type="submit" className={dialog.danger ? 'danger' : ''}>
            {dialog.type === 'confirm' ? (dialog.danger ? 'Delete' : 'Confirm') : 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
