import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2, Download } from 'lucide-react';
import type { Image } from '../db/types';
import type { Data } from '../db/data-store';
import { useAgentSessions } from '../modules/agent';

type Tab = 'view' | 'data';

export default function ImageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const agentSessions = useAgentSessions();
  
  const [image, setImage] = useState<Image | null>(null);
  const [imageContent, setImageContent] = useState<string | null>(null);
  const [dataEntries, setDataEntries] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('view');
  const [addingToContext, setAddingToContext] = useState(false);
  
  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Refetch data entries when switching to data tab
  useEffect(() => {
    if (activeTab === 'data' && id) {
      const refetchData = async () => {
        try {
          const data = await window.db.data.getByParent(id);
          setDataEntries(data);
        } catch (err) {
          console.error('Failed to refetch data entries:', err);
        }
      };
      refetchData();
    }
  }, [activeTab, id]);

  // Fetch image and content
  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      try {
        const imageData = await window.images.getByPublicId(id);
        if (!imageData) {
          setError('Image not found');
          return;
        }
        setImage(imageData);

        // Get image content for rendering
        const content = await window.images.getImageContent(id);
        if (!content) {
          setError('Failed to load image content');
          return;
        }
        setImageContent(content);

        // Load data entries
        const data = await window.db.data.getByParent(id);
        setDataEntries(data);
      } catch (err) {
        setError('Failed to load image');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const handleAddToContext = async () => {
    if (!id) return;

    setAddingToContext(true);
    try {
      const { chatId } = agentSessions.currentChatId
        ? { chatId: agentSessions.currentChatId }
        : await agentSessions.ensureChatForActions();
      await window.chat.addToContext(`chat-${chatId}`, id);
    } catch {
      // Failed to add to context
    } finally {
      setAddingToContext(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!id) return;
    
    setDeleting(true);
    try {
      await window.images.delete(id, deleteData);
      navigate('/');
    } catch (err) {
      console.error('Failed to delete image:', err);
      alert('Failed to delete image. Please try again.');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleDownload = async () => {
    if (!id) return;
    
    setDownloading(true);
    try {
      const result = await window.images.download(id);
      if (!result.canceled) {
        // Success - could show a toast notification here if desired
      }
    } catch (err) {
      console.error('Failed to download image:', err);
      alert('Failed to download image. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6 h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </main>
    );
  }

  if (error || !image) {
    return (
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          <button 
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Files
          </button>
          <div className="bg-[#2b2b2b] rounded-lg border border-[#333333] p-8 text-center text-red-400">
            {error || 'Image not found'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-white mb-3">{image.file_name}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/data/new?parent_id=${id}`)}
              className="flex items-center gap-1.5 bg-[#2a2a2a] hover:bg-[#333333] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <span>Add Data</span>
            </button>
            <button
              onClick={handleAddToContext}
              disabled={addingToContext}
              className="flex items-center gap-1.5 bg-[#2a2a2a] hover:bg-[#333333] disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {addingToContext ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>Add to Chat</span>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 bg-[#2a2a2a] hover:bg-[#333333] disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Download size={14} />
                  <span>Download</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#2b2b2b] border border-[#333333] rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-white mb-4">Delete Image</h2>
              <p className="text-gray-300 mb-4">
                Are you sure you want to delete "{image.file_name}"? This will:
              </p>
              <ul className="text-gray-400 text-sm mb-4 list-disc list-inside space-y-1">
                <li>Delete the image from storage</li>
                <li>Unlink all associated data entries (always done)</li>
              </ul>
              <label className="flex items-center gap-2 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteData}
                  onChange={(e) => setDeleteData(e.target.checked)}
                  className="w-4 h-4 rounded border-0 bg-[#2a2a2a] focus:ring-0 focus:outline-none"
                  style={{ accentColor: '#4a4a4a' }}
                />
                <span className="text-gray-300 text-sm">Also delete data entries (they will be unlinked regardless)</span>
              </label>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeleteData(false);
                  }}
                  disabled={deleting}
                  className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333333] disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteImage}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#333333]">
          <button
            onClick={() => setActiveTab('view')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'view'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            View
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'data'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Data ({dataEntries.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'view' && (
          <div className="h-full overflow-hidden">
            {/* Image Viewer */}
            {imageContent ? (
              <div className="h-full flex items-center justify-center p-8">
                <img 
                  src={imageContent} 
                  alt={image.file_name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'data' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Data Entries Table */}
            <div className="flex-1 overflow-auto px-6 pt-0 pb-4">
              {dataEntries.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  No data entries. Click "Add Data" to create one.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="border-b border-[#333333]">
                    <tr>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-300">Key</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-300">Type</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-300">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataEntries.map((entry) => (
                      <tr
                        key={entry.public_id}
                        onClick={() => navigate(`/data/${entry.id}`)}
                        className="hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{entry.key}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#9ca3af]">
                            {entry.type || <span className="text-gray-600 italic">—</span>}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#9ca3af]">
                            {entry.value ? (
                              entry.value.length > 20
                                ? `${entry.value.substring(0, 20)}...`
                                : entry.value
                            ) : (
                              <span className="text-gray-600 italic">(empty)</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

