import { useEffect, useRef, useState } from 'react';
import { UploadCloud, PenTool, Stamp, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const API_ORIGIN = import.meta.env.VITE_API_URL;

function UploadBox({ title, icon: Icon, currentPath, onUpload, uploading }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onUpload(file);
    e.target.value = '';
  }

  const imgSrc = preview ?? (currentPath ? `${API_ORIGIN}${currentPath}` : null);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-blue-900" />
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>

      <div className="h-36 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-sm text-slate-400">No {title.toLowerCase()} uploaded yet</p>
        )}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
        {currentPath ? `Replace ${title}` : `Upload ${title}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <p className="text-xs text-slate-400">PNG, JPG, or WEBP — max 2MB. Appears on the invoice PDF.</p>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({ signaturePath: null, stampPath: null });
  const [loading, setLoading] = useState(true);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);

  async function fetchSettings() {
    try {
      const { data } = await api.get('/api/settings');
      setSettings(data);
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSettings(); }, []);

  async function handleUpload(kind, file, setUploading) {
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      await api.post(`/api/settings/${kind}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${kind === 'signature' ? 'Signature' : 'Stamp'} uploaded`);
      await fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Business configuration for generated documents</p>
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-blue-900" /> Stamp &amp; Signature
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Uploaded here, these appear bottom-right on every invoice/statement PDF, above the "Authorized Signatory" line.
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-64 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UploadBox
              title="Signature"
              icon={PenTool}
              currentPath={settings.signaturePath}
              uploading={uploadingSignature}
              onUpload={(file) => handleUpload('signature', file, setUploadingSignature)}
            />
            <UploadBox
              title="Stamp"
              icon={Stamp}
              currentPath={settings.stampPath}
              uploading={uploadingStamp}
              onUpload={(file) => handleUpload('stamp', file, setUploadingStamp)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
