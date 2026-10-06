import React, { useState, useEffect } from 'react';
import visualApi from '../../api/visualApi';

export default function ServiceStatus() {
  const [mlHealth, setMLHealth]         = useState(null);
  const [datasetStatus, setDatasetStatus] = useState(null);
  const [indexStats, setIndexStats]     = useState(null);
  const [expanded, setExpanded]         = useState(false);

  const refresh = async () => {
    try {
      const [health, dataset, index] = await Promise.all([
        visualApi.getMLHealth().catch(() => null),
        visualApi.getDatasetStatus().catch(() => null),
        visualApi.getIndexStats().catch(() => null),
      ]);
      setMLHealth(health);
      setDatasetStatus(dataset);
      setIndexStats(index);
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  const isMLRunning   = mlHealth?.status === 'ok';
  const isModelLoaded = mlHealth?.model_loaded;
  const noTorch       = mlHealth?.model_source === 'unavailable_no_torch';
  const isFineTuned   = mlHealth?.model_source === 'fine_tuned';
  const isIndexBuilt  = mlHealth?.index_built;
  const sellerCount   = mlHealth?.seller_products ?? indexStats?.seller_products ?? 0;
  const embDim        = mlHealth?.embedding_dim ?? 1280;

  const modelLabel = noTorch
    ? '⚠ No PyTorch'
    : isFineTuned ? '✓ Fine-Tuned' : '✓ ImageNet Pretrained';
  const modelColor = noTorch
    ? 'bg-red-100 text-red-700'
    : isFineTuned ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-primary-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <h3 className="text-sm font-semibold text-gray-700">⚙️ Service Status</h3>
        <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 animate-fade-in">

          {/* ML Service */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-xs text-gray-600">ML Service (Port 5002)</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isMLRunning ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {isMLRunning ? '● Running' : '● Offline'}
            </span>
          </div>

          {/* EfficientNet-B0 model */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-xs text-gray-600">EfficientNet-B0</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${modelColor}`}>
              {modelLabel}
            </span>
          </div>

          {noTorch && (
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Visual search needs PyTorch. Stop the current process and run <code className="font-mono">npm run dev:visual</code> (creates/uses <code className="font-mono">visual-ml-service\.venv</code>).
            </div>
          )}

          {/* Model source */}
          {mlHealth && !noTorch && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-xs text-gray-600">Model Source</span>
              <span className="text-xs text-gray-500">
                {isFineTuned ? 'Fine-tuned weights (.pth)' : 'Pretrained ImageNet weights'}
              </span>
            </div>
          )}

          {/* Embedding Vectors */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-xs text-gray-600">Embedding Vectors ({embDim}-dim)</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              sellerCount > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {sellerCount > 0 ? `✓ ${sellerCount} products` : '⚠ No products'}
            </span>
          </div>

          {/* Embedding Index */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-xs text-gray-600">Hybrid Search Index</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isIndexBuilt ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {isIndexBuilt
                ? `✓ Ready (${indexStats?.total_products || sellerCount} total)`
                : '⚠ No products indexed'}
            </span>
          </div>

          {/* TF-IDF */}
          {mlHealth && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-xs text-gray-600">TF-IDF Vectorizer</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                mlHealth.tfidf_fitted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {mlHealth.tfidf_fitted ? '✓ Fitted' : '⚠ Not fitted'}
              </span>
            </div>
          )}

          {/* Dataset per category */}
          {datasetStatus?.categories && (
            <div className="mt-2">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">📂 Training Images</h4>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(datasetStatus.categories).map(([catId, info]) => (
                  <div key={catId} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                    <span className="text-[10px] text-gray-600 capitalize">{catId.replace(/_/g, ' ')}</span>
                    <span className={`text-[10px] font-bold ${
                      info.status === 'ready' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {info.count} imgs {info.status === 'ready' ? '✓' : '(need 10)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={refresh}
            className="w-full py-2 text-xs text-primary-900 hover:bg-primary-50 rounded-lg transition-all mt-1"
          >
            🔄 Refresh Status
          </button>
        </div>
      )}
    </div>
  );
}
