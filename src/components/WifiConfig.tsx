import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';

const WifiConfig: React.FC = () => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [encryption, setEncryption] = useState('WPA');
  const [isHidden, setIsHidden] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  };

  const handleGenerate = () => {
    if (!ssid.trim()) {
      showToast('请输入网络名称 (SSID)');
      return;
    }
    if (encryption !== 'nopass' && !password) {
      showToast('请输入热点密码');
      return;
    }
    setShowModal(true);
  };

  const escapeString = (str: string) => str.replace(/([\\;:"])/g, '\\$1');

  const getWifiString = () => {
    const escapedSsid = escapeString(ssid.trim());
    const escapedPassword = escapeString(password);
    let wifiString = `WIFI:S:${escapedSsid};T:${encryption};`;
    if (encryption !== 'nopass') wifiString += `P:${escapedPassword};`;
    if (isHidden) wifiString += `H:true;`;
    wifiString += `;`;
    return wifiString;
  };

  const downloadQRCode = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `WIFI_${ssid.trim()}_QRCode.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="flex flex-col items-center justify-center antialiased text-gray-800 w-full">
      {/* Toast */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-6 left-1/2 bg-gray-900 text-white px-6 py-3.5 rounded-full shadow-2xl z-50 text-sm font-medium whitespace-nowrap"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] w-full relative z-10 overflow-hidden"
      >
        {/* Header */}
        <div className="pt-10 pb-6 px-6 sm:px-8 text-center relative">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-50/50 to-transparent -z-10" />
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">中继器扫码配置</h1>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">免密扫码，一键连接网络</p>
        </div>

        {/* Form */}
        <div className="px-6 sm:px-8 pb-8 space-y-5">
          {/* SSID */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">网络名称 (SSID)</label>
            <input
              type="text"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="例如：My Hotspot"
              className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">热点密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={encryption === 'nopass'}
                placeholder={encryption === 'nopass' ? '无需密码' : '输入密码'}
                className={`w-full pl-4 pr-12 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium ${
                  encryption === 'nopass' ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
              {encryption !== 'nopass' && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors p-2 text-xs font-semibold"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              )}
            </div>
          </div>

          {/* Encryption & Hidden */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">加密方式</label>
              <select
                value={encryption}
                onChange={(e) => setEncryption(e.target.value)}
                className="w-full px-4 py-3.5 bg-gray-50/80 border border-gray-100 rounded-2xl text-gray-700 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-200 text-base font-medium cursor-pointer"
              >
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">无密码</option>
              </select>
            </div>
            
            <div className="flex flex-col items-end justify-center">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">隐藏网络</label>
              <button
                onClick={() => setIsHidden(!isHidden)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  isHidden ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    isHidden ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all duration-200 active:scale-[0.98] mt-6"
          >
            生成二维码
          </button>
        </div>
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-lg flex flex-col items-center justify-center p-6"
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 text-4xl font-light"
            >
              &times;
            </button>

            <h3 className="text-white text-lg sm:text-xl font-bold tracking-widest mb-8 sm:mb-10 opacity-90">
              扫一扫，立即连接
            </h3>
            
            <div className="relative mb-10 sm:mb-12">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-sky-500 rounded-[2.5rem] blur-xl opacity-40" />
              <div className="relative bg-white p-5 rounded-[2rem] shadow-2xl flex justify-center items-center">
                <QRCodeSVG
                  id="qr-code-svg"
                  value={getWifiString()}
                  size={Math.min(window.innerWidth - 80, 300)}
                  level="M"
                  marginSize={1}
                />
              </div>
            </div>

            <button
              onClick={downloadQRCode}
              className="bg-white/10 border border-white/20 hover:bg-white/20 text-white px-8 py-3.5 rounded-full shadow-lg font-medium backdrop-blur-md transition-all"
            >
              保存到相册
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WifiConfig;
