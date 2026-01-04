import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatContextItemWithFile } from '../db/types';
import { Trash2, FileText } from 'lucide-react';
import { useAgentSessions } from '../modules/agent';

export default function Context() {
  const navigate = useNavigate();
  const agentSessions = useAgentSessions();
  const [items, setItems] = useState<ChatContextItemWithFile[]>([]);
  const [loading, setLoading] = useState(true);
  const chatId = agentSessions.currentConversationId;

  useEffect(() => {
    if (!chatId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    window.chat
      .getContext(chatId)
      .then(result => {
        setItems(result);
      })
      .catch(() => {
        // Failed to load context
      })
      .finally(() => setLoading(false));
  }, [chatId]);

  const handleRemove = async (publicId: string) => {
    try {
      await window.chat.removeFromContext(publicId);
      setItems(prev => prev.filter(item => item.public_id !== publicId));
    } catch {
      // Failed to remove context item
    }
  };

  return (
    <main className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Context</h1>
          <p className="text-sm text-gray-500 mt-1">Files attached to current chat</p>
        </div>

        {!chatId ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500">No chat selected. Open or create a chat to view context items.</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500">No context items for this chat</p>
          </div>
        ) : (
          <div>
            <table className="w-full text-left">
              <thead className="border-b border-gray-300">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  // Determine entity type and route
                  let route = '';
                  let displayName = item.file_name || 'Unknown';
                  let isPage = false;
                  
                  if (item.page_public_id) {
                    // This is a page
                    isPage = true;
                    displayName = item.file_name || `Page ${item.page_number || '?'}`;
                    // Don't navigate for pages - they're handled differently
                    route = '';
                  } else if (item.file_public_id) {
                    route = `/files/${item.file_public_id}`;
                  } else if (item.image_public_id) {
                    route = `/images/${item.image_public_id}`;
                  }
                  
                  return (
                    <tr 
                      key={item.public_id}
                      onClick={() => {
                        if (route) {
                          navigate(route);
                        }
                      }}
                      className={`hover:bg-gray-50 transition-colors group ${route ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-2 ${route ? 'group-hover:text-blue-600' : ''} transition-colors`}>
                          {isPage && <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                          <span className={`font-medium ${route ? 'text-gray-900' : 'text-gray-700'}`}>
                            {displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(item.public_id);
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

