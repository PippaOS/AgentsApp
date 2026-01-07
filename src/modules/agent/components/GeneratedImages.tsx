/**
 * GeneratedImages Component
 * 
 * Displays AI-generated images from OpenRouter's image generation models.
 * Handles multiple images and displays them in a responsive grid.
 */

import { useState } from 'react';
import { Download, Loader2, Save } from 'lucide-react';
import Toast, { type ToastType } from './Toast';

interface GeneratedImagesProps {
  images: Array<{
    id?: string;
    url: string; // Base64 data URL
  }>;
  isStreaming?: boolean;
}

export default function GeneratedImages({ images, isStreaming = false }: GeneratedImagesProps) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showFilenameDialog, setShowFilenameDialog] = useState<number | null>(null);
  const [filenameInput, setFilenameInput] = useState('');

  if (images.length === 0) {
    return null;
  }

  const generateDefaultFilename = (imageUrl: string): string => {
    // Extract image type from data URL
    const match = imageUrl.match(/^data:image\/([^;]+);base64,/);
    const imageType = match ? match[1].toLowerCase() : 'png';
    const extension = imageType === 'jpeg' ? '.jpg' : `.${imageType}`;
    
    // Generate random ID for filename
    const randomId = crypto.randomUUID().split('-')[0];
    
    return `image-${randomId}${extension}`;
  };

  const handleSaveClick = (index: number, imageUrl: string) => {
    const defaultFilename = generateDefaultFilename(imageUrl);
    setFilenameInput(defaultFilename);
    setShowFilenameDialog(index);
  };

  const handleSaveConfirm = async (imageUrl: string) => {
    if (showFilenameDialog === null) return;
    
    const index = showFilenameDialog;
    setSavingIndex(index);
    setShowFilenameDialog(null);

    try {
      const fileName = filenameInput.trim() || generateDefaultFilename(imageUrl);
      await window.images.saveFromBase64(imageUrl, fileName);
      setToast({ message: 'Image saved successfully!', type: 'success' });
    } catch (error) {
      setToast({ 
        message: `Failed to save image: ${(error as Error).message}`, 
        type: 'error' 
      });
    } finally {
      setSavingIndex(null);
      setFilenameInput('');
    }
  };

  const handleCancelDialog = () => {
    setShowFilenameDialog(null);
    setFilenameInput('');
  };

  const handleDownload = (imageUrl: string) => {
    try {
      // Extract image type and data from data URL
      const match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid image format');
      }

      const imageType = match[1].toLowerCase();
      const base64Data = match[2];
      // const extension = imageType === 'jpeg' ? 'jpg' : imageType;

      // Generate filename
      const filename = generateDefaultFilename(imageUrl);

      // Convert base64 to blob
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${imageType}` });

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setToast({
        message: `Failed to download image: ${(error as Error).message}`,
        type: 'error',
      });
    }
  };

  return (
    <>
      <div className="generated-images-container flex flex-col gap-4">
        {images.map((img, index) => {
          const imgId = img.id || `img-${index}`;
          const isSaving = savingIndex === index;
          
          return (
            <div key={imgId} className="relative group self-start w-fit max-w-full">
              <img
                src={img.url}
                alt={`Generated image ${index + 1}`}
                className={`max-w-full rounded-lg ${isStreaming ? 'animate-pulse' : ''}`}
                style={{ maxHeight: '512px', objectFit: 'contain', display: 'block' }}
                loading="lazy"
              />
              {isStreaming && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  Generating...
                </div>
              )}
              {!isStreaming && (
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                  <button
                    onClick={() => handleSaveClick(index, img.url)}
                    disabled={isSaving}
                    className="bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white p-2 rounded-lg border border-[#333333] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Save to app files"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDownload(img.url)}
                    className="bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white p-2 rounded-lg border border-[#333333] shadow-lg transition-colors"
                    title="Download to computer"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filename Dialog */}
      {showFilenameDialog !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2b2b2b] border border-[#333333] rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-white mb-4">Save Image</h2>
            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-2">Filename:</label>
              <input
                type="text"
                value={filenameInput}
                onChange={(e) => setFilenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveConfirm(images[showFilenameDialog].url);
                  } else if (e.key === 'Escape') {
                    handleCancelDialog();
                  }
                }}
                className="w-full bg-[#1f1f1f] border border-[#333333] text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={handleCancelDialog}
                className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333333] text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveConfirm(images[showFilenameDialog].url)}
                className="px-4 py-2 bg-[#4a4a4a] hover:bg-[#555555] text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

