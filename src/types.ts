export interface RoomMember {
  socketId: string; // 斷線時需要用這個來踢人
  uid: string; // Firebase 的用戶唯一 ID
  displayName: string; // 暱稱
  photoURL: string; // 頭像
  joinedAt: number; // 加入時間（選用，方便排序）
}

export interface RoomMessage {
  id: number;
  uid: string;
  displayName: string;
  text: string;
  timestamp: string;
}

export interface RoomData {
  roomId: string;
  currentVideoIndex: number;
  currentVideoId: string;
  isPlaying: boolean;
  playbackTimestamp: number; // 影片暫停或最後一次同步時的秒數
  lastUpdatedAt: number; // 伺服器時間戳 (Date.now())，用來計算網路延遲補償
  playlist: PlaylistItem[];
  members: RoomMember[];
  messages: RoomMessage[];
}

export interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnail: string;
}

// 暫存於記憶體中的資料庫 (MVP 階段先用 Map 實作)
export const rooms = new Map<string, RoomData>();
