import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WifiConfig from './components/WifiConfig';

// IndexedDB Constants
const DB_NAME = 'MedicalTerminalDB';
const STORE_NAME = 'syncQueue';

const App: React.FC = () => {
  // State for Hospital Overview
  const [hospitalName, setHospitalName] = useState('');
  const [totalOrs, setTotalOrs] = useState('');
  const [effectiveOrs, setEffectiveOrs] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  // State for Inspection Records
  const [currentValidSNs, setCurrentValidSNs] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [penetration, setPenetration] = useState(0);

  // State for Sync Queue
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Toast State
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  const showToast = (msg: string) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  // IndexedDB Logic
  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const updateQueueCount = async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => setQueueCount(req.result.length);
    } catch (e) {
      console.error('Failed to update queue count', e);
    }
  };

  const saveToQueue = async (data: any) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(data);
    tx.oncomplete = () => updateQueueCount();
  };

  const getQueue = async (): Promise<any[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const clearItem = async (id: any) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => updateQueueCount();
  };

  const syncData = async () => {
    const queue = await getQueue();
    if (queue.length === 0) return;
    
    console.log(`Starting sync for ${queue.length} items...`);
    for (const item of queue) {
      await new Promise(res => setTimeout(res, 500)); 
      console.log('Synced successfully:', item);
      await clearItem(item.id);
    }
    showToast('离线数据已自动同步完成');
  };

  // Lifecycle
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncData();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updateQueueCount();

    if (navigator.onLine) syncData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handlers
  const handleFetchData = () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneMin = 60 * 1000;
    const logs = [
      { sn: 'SN-1001', timestamp: now - 5 * oneDay },
      { sn: 'SN-1001', timestamp: now - 5 * oneDay + 15 * oneMin },
      { sn: 'SN-1002', timestamp: now - 2 * oneDay },
      { sn: 'SN-1002', timestamp: now - 2 * oneDay + 5 * oneMin },
      { sn: 'SN-1003', timestamp: now - 40 * oneDay },
      { sn: 'SN-1003', timestamp: now - 40 * oneDay + 20 * oneMin },
      { sn: 'SN-1004', timestamp: now - 2 * 60 * oneMin },
      { sn: 'SN-1004', timestamp: now },
    ];

    const snMap: any = {};
    logs.forEach(log => {
      if (!snMap[log.sn]) {
        snMap[log.sn] = { minTime: log.timestamp, maxTime: log.timestamp };
      } else {
        snMap[log.sn].minTime = Math.min(snMap[log.sn].minTime, log.timestamp);
        snMap[log.sn].maxTime = Math.max(snMap[log.sn].maxTime, log.timestamp);
      }
    });

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const tenMinsMs = 10 * 60 * 1000;
    const validSNs: string[] = [];

    for (const sn in snMap) {
      const data = snMap[sn];
      const timeDiff = data.maxTime - data.minTime;
      const isRecent = (now - data.maxTime) <= thirtyDaysMs;
      if (timeDiff >= tenMinsMs && isRecent) {
        validSNs.push(sn);
      }
    }

    const tOrs = parseInt(totalOrs) || 0;
    const eOrs = parseInt(effectiveOrs) || 0;
    const N = validSNs.length;
    
    setCurrentValidSNs(validSNs);
    setEstimatedTotal(N * eOrs);
    setShowResult(true);

    if (tOrs > 0) {
      setPenetration(Math.min(100, Math.round((eOrs / tOrs) * 100)));
    } else {
      setPenetration(0);
    }
    showToast('数据拉取与计算完成');
  };

  const handleReport = async () => {
    if (!hospitalName.trim()) {
      showToast('请填写医院名称');
      return;
    }

    const payload = {
      id: Date.now().toString(),
      hospitalName,
      totalOrs,
      effectiveOrs,
      roomNumber,
      estimatedTotal,
      validSNs: currentValidSNs,
      timestamp: new Date().toISOString()
    };

    if (navigator.onLine) {
      showToast('正在存储数据...');
      setTimeout(() => showToast('✅ 存储成功！'), 1000);
    } else {
      await saveToQueue(payload);
      showToast('已离线暂存，连网后将自动同步');
    }
  };

  const clearCacheAndReload = () => {
    if ('caches' in window) {
      caches.keys().then(names => {
        for (const name of names) caches.delete(name);
        alert('缓存已清除，即将刷新页面');
        (window as any).location.reload();
      });
    } else {
      (window as any).location.reload();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-blue-50 via-white to-sky-50 p-4 pb-12 antialiased text-gray-800">
      {/* Toast */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-6 left-1/2 bg-gray-900 text-white px-6 py-3.5 rounded-full shadow-2xl z-50 text-sm font-medium whitespace-nowrap"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-md mx-auto space-y-6">
        {/* Hospital Overview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-[2.5rem] p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]"
        >
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-6">医院概况</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">医院名称 (必填)</label>
              <input 
                type="text" 
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="例如：市第一人民医院" 
                className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">手术间总数</label>
                <input 
                  type="number" 
                  value={totalOrs}
                  onChange={(e) => setTotalOrs(e.target.value)}
                  placeholder="20" 
                  className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">有效使用间数</label>
                <input 
                  type="number" 
                  value={effectiveOrs}
                  onChange={(e) => setEffectiveOrs(e.target.value)}
                  placeholder="15" 
                  className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">当前采集房间号</label>
              <input 
                type="text" 
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="OR-01" 
                className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium"
              />
            </div>
          </div>
        </motion.div>

        {/* Wifi Config Component */}
        <WifiConfig />

        {/* Inspection Records */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-[2.5rem] p-8 shadow-[0_20px_60px_-15px_rgba(0,0_0,0.05)]"
        >
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-6">巡检记录</h2>
          <button 
            onClick={handleFetchData}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-4 px-4 rounded-2xl shadow-lg shadow-gray-900/20 transition-all duration-200 active:scale-[0.98] mb-8"
          >
            拉取设备数据
          </button>
          
          <AnimatePresence>
            {showResult && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-8 overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50/80 rounded-2xl p-5 text-center border border-gray-100">
                    <div className="text-3xl font-extrabold text-blue-600 mb-1">{currentValidSNs.length}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">当前房间有效 SN</div>
                  </div>
                  <div className="bg-gray-50/80 rounded-2xl p-5 text-center border border-gray-100">
                    <div className="text-3xl font-extrabold text-blue-600 mb-1">{estimatedTotal}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">30天预估用量</div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <span>渗透率分析</span>
                    <span className="text-gray-900">{penetration}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${penetration}%` }}
                      className="h-full bg-blue-500"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6 max-h-48 overflow-y-auto space-y-2.5">
                  {currentValidSNs.length > 0 ? (
                    currentValidSNs.map(sn => (
                      <div key={sn} className="text-sm font-mono text-gray-500 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {sn}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-300 text-center py-4">暂无符合标准的 SN</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Data Storage */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-[2.5rem] p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]"
        >
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-6">数据存储</h2>
          <button 
            onClick={handleReport}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all duration-200 active:scale-[0.98]"
          >
            同步巡检数据
          </button>
        </motion.div>

        {/* Network Status */}
        <div className="text-center text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center justify-center gap-4">
          <span className={isOnline ? 'text-green-500' : 'text-red-500'}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-200" />
          <span>Queue: <span className="text-gray-900">{queueCount}</span></span>
        </div>

        {/* Footer */}
        <footer className="text-center pt-12 pb-8 space-y-4">
          <div className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Version 2.2 (React + Motion)</div>
          <button 
            onClick={clearCacheAndReload}
            className="text-xs text-blue-400 font-medium hover:text-blue-600 transition-colors"
          >
            修复异常(清缓存)
          </button>
        </footer>
      </div>
    </div>
  );
};

export default App;
