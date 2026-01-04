import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Data } from '../db/data-store';

export default function Data() {
  const navigate = useNavigate();
  const [dataEntries, setDataEntries] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const allData = await window.db.data.getAll();
      setDataEntries(allData);
    } catch (error) {
      console.error('Failed to fetch data entries:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Data</h1>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : dataEntries.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <h3 className="text-lg font-medium text-gray-900">No data entries yet</h3>
            <p className="text-gray-500 mt-1">Data entries will appear here when created.</p>
          </div>
        ) : (
          <div>
            <table className="w-full text-left">
              <thead className="border-b border-gray-300">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Key</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Parent ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Created</th>
                </tr>
              </thead>
              <tbody>
                {dataEntries.map((entry) => (
                  <tr 
                    key={entry.public_id} 
                    onClick={() => navigate(`/data/${entry.id}`)}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{entry.key}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {entry.type || <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">
                      {entry.parent_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

