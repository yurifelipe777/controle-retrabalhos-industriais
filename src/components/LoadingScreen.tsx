export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(224, 43%, 5%)' }}>
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: '#E8291C' }}
          >
            <span className="font-black text-white text-lg tracking-[3px]">C</span>
          </div>
          <div
            className="absolute -inset-2 rounded-xl opacity-20 animate-pulse"
            style={{ background: 'radial-gradient(circle, #E8291C 0%, transparent 70%)' }}
          />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#E8291C',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                opacity: 0.6,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  )
}
