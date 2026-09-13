import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Full-screen viewer for a task's image attachments — prev/next through the
// whole grid, download, and (when permitted) an inline caption editor. Takes
// the same `attachments` array TaskModal already has in state rather than
// re-fetching, so the arrow keys/buttons feel instant.
export default function AttachmentLightbox({ attachments, index, onClose, onNavigate, canEdit, onSaveCaption }) {
  const attachment = attachments[index];
  const [captionDraft, setCaptionDraft] = useState(attachment?.caption || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCaptionDraft(attachment?.caption || '');
  }, [attachment?.id]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onNavigate((index - 1 + attachments.length) % attachments.length);
      else if (e.key === 'ArrowRight') onNavigate((index + 1) % attachments.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, attachments.length, onClose, onNavigate]);

  if (!attachment) return null;

  async function saveCaption() {
    if ((attachment.caption || '') === captionDraft) return;
    setSaving(true);
    try {
      await onSaveCaption(attachment.id, captionDraft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lightbox-scrim" onClick={onClose}>
      <button className="icon-btn lightbox-close" onClick={onClose} title="Close"><Icon name="x" size={20} /></button>

      {attachments.length > 1 && (
        <>
          <button
            className="icon-btn lightbox-nav lightbox-prev"
            onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + attachments.length) % attachments.length); }}
            title="Previous image"
          ><Icon name="chevron" size={22} style={{ transform: 'rotate(90deg)' }} /></button>
          <button
            className="icon-btn lightbox-nav lightbox-next"
            onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % attachments.length); }}
            title="Next image"
          ><Icon name="chevron" size={22} style={{ transform: 'rotate(-90deg)' }} /></button>
        </>
      )}

      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <img className="lightbox-image" src={attachment.url} alt={attachment.caption || attachment.original_name} />

        <div className="lightbox-footer">
          <div className="lightbox-meta">
            <span className="lightbox-filename">{attachment.original_name}</span>
            <span className="settings-hint" style={{ margin: 0 }}>
              {formatSize(attachment.size)}
              {attachment.uploader_name && ` · uploaded by ${attachment.uploader_name}`}
              {attachments.length > 1 && ` · ${index + 1} of ${attachments.length}`}
            </span>
          </div>
          <a className="icon-btn" href={`${attachment.url}?download=1`} title="Download" download>
            <Icon name="download" size={16} />
          </a>
        </div>

        {canEdit(attachment) ? (
          <input
            className="lightbox-caption-input"
            placeholder="Add a caption…"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            disabled={saving}
          />
        ) : attachment.caption ? (
          <p className="lightbox-caption-text">{attachment.caption}</p>
        ) : null}
      </div>
    </div>
  );
}
