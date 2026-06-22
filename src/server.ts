import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { rooms } from "./types.js";
import type { RoomMember, RoomData, PlaylistItem } from "./types.js";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket: Socket) => {
  console.log(`⚡ 使用者已連線: ${socket.id}`);

  // 加入房間與初始化
  socket.on(
    "enterParty",
    ({
      roomId,
      user,
    }: {
      roomId: string;
      user: { uid: string; displayName: string; photoURL: string };
    }) => {
      socket.join(roomId);
      console.log(`使用者 ${socket.id} 加入房間 ${roomId}`);

      // 1. 如果房間還不存在，先初始化
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          roomId,
          currentVideoIndex: 0,
          currentVideoId: "",
          isPlaying: false,
          playbackTimestamp: 0,
          lastUpdatedAt: Date.now(),
          playlist: [],
          members: [],
          messages: [],
        });
      }

      // 2. 獲取房間資料，並把當前加入的使用者放進 members
      const room = rooms.get(roomId);
      if (room && user) {
        // 3. 檢查這個人是不是已經在房間裡了（避免重複整理，例如重新整理網頁）
        const isAlreadyInRoom = room.members.some(
          (m: RoomMember) => m.uid === user.uid,
        );

        if (!isAlreadyInRoom) {
          // 4. 建立完整的成員資料物件並推入陣列
          const newMember: RoomMember = {
            socketId: socket.id,
            uid: user.uid || "",
            displayName: user.displayName || "訪客",
            photoURL: user.photoURL || "",
            joinedAt: Date.now(),
          };
          room.members.push(newMember);
        } else {
          // 如果人已經在裡面（可能換了 Socket 連線），更新他的 socketId
          const member = room.members.find(
            (m: RoomMember) => m.uid === user.uid,
          );
          if (member) member.socketId = socket.id;
        }

        // 5. 同步最新狀態給當前加入的人
        socket.emit("roomDataSync", room);
      }
    },
  );

  // 從大廳搜尋歌曲開房
  socket.on(
    "enterPartyWithSong",
    ({ roomId, song }: { roomId: string; song: PlaylistItem }) => {
      // 1. 如果房間還不存在，先初始化
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          roomId,
          currentVideoIndex: 0,
          currentVideoId: "",
          isPlaying: false,
          playbackTimestamp: 0,
          lastUpdatedAt: Date.now(),
          playlist: [],
          members: [],
          messages: [],
        });
      }

      // 2. 使用 .get() 把房間狀態拿出來
      const room = rooms.get(roomId);

      // TypeScript 的安全檢查：確保 room 有拿到東西才操作
      if (room) {
        room.playlist.push(song);

        // 如果房間原本沒有在播歌，就自動把歌單的第一首歌拿來播
        if (!room.currentVideoId && song) {
          room.currentVideoId = song.videoId;
        }

        // 廣播給房間內所有人：房間狀態更新了！
        io.to(roomId).emit("roomDataSync", room);
      }
    },
  );

  // 從收藏歌單開房
  socket.on(
    "enterPartyWithPlaylist",
    ({ roomId, songs }: { roomId: string; songs: PlaylistItem[] }) => {
      // 1. 如果房間還不存在，先初始化
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          roomId,
          currentVideoIndex: 0,
          currentVideoId: "",
          isPlaying: false,
          playbackTimestamp: 0,
          lastUpdatedAt: Date.now(),
          playlist: [],
          members: [],
          messages: [],
        });
      }

      // 2. 使用 .get() 把房間狀態拿出來
      const currentRoom = rooms.get(roomId);

      // TypeScript 的安全檢查：確保 currentRoom 有拿到東西才操作
      if (currentRoom) {
        currentRoom.playlist = [...currentRoom.playlist, ...songs];

        // 如果房間原本沒有在播歌，就自動把歌單的第一首歌拿來播
        if (!currentRoom.currentVideoId && songs.length > 0) {
          currentRoom.currentVideoId = songs[0]?.videoId ?? "";
        }

        // 廣播給房間內所有人：房間狀態更新了！
        io.to(roomId).emit("roomDataSync", currentRoom);
      }
    },
  );

  // 點歌 (加入歌單)
  socket.on(
    "addToQueue",
    ({ roomId, item }: { roomId: string; item: PlaylistItem }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.playlist.push(item);

        // 如果當前是沒有影片，直接播放
        if (room.currentVideoId === "") {
          const nextVideo = room.playlist[0];
          if (nextVideo) {
            room.currentVideoId = nextVideo.videoId;
            room.isPlaying = true;
            room.playbackTimestamp = 0;
            room.lastUpdatedAt = Date.now();
            io.in(roomId).emit("videoChanged", room);
            return;
          }
        }

        // 否則只是更新歌單，廣播給所有人
        io.in(roomId).emit("roomDataSync", room);
      } else {
        console.log(`❌ 找不到房間 ${roomId}，點歌失敗！`); // 🐛 Debug 專用
      }
    },
  );
  // 播放
  socket.on(
    "playVideo",
    ({ roomId, timestamp }: { roomId: string; timestamp: number }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.isPlaying = true;
        room.playbackTimestamp = timestamp;
        room.lastUpdatedAt = Date.now();
        socket.to(roomId).emit("videoPlayed", room);
      }
    },
  );
  // 暫停
  socket.on(
    "pauseVideo",
    ({ roomId, timestamp }: { roomId: string; timestamp: number }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.isPlaying = false;
        room.playbackTimestamp = timestamp;
        room.lastUpdatedAt = Date.now();
        socket.to(roomId).emit("videoPaused", room);
      }
    },
  );
  // 下一首
  socket.on("playNext", (roomId: string) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // 檢查清單是否還有下一首歌
    if (room.playlist.length > 0) {
      // 🌟 計算下一首歌的索引：如果到了最後一首，就循環回第一首 (或設為 -1 停止)
      const nextIndex = (room.currentVideoIndex + 1) % room.playlist.length;

      room.currentVideoIndex = nextIndex;
      let nextVideo = room.playlist[nextIndex] ?? room.playlist[0]!;

      room.currentVideoId = nextVideo.videoId;
      room.isPlaying = true;
      room.playbackTimestamp = 0;
      room.lastUpdatedAt = Date.now();

      // 通知所有人換歌了
      io.in(roomId).emit("videoChanged", room);
    } else {
      // 沒有歌了
      room.isPlaying = false;
      io.in(roomId).emit("roomDataSync", room);
    }
  });
  // 換歌
  socket.on(
    "playSpecific",
    ({ roomId, index }: { roomId: string; index: number }) => {
      const room = rooms.get(roomId);
      if (room && room.playlist[index]) {
        // 更新索引與狀態
        room.currentVideoIndex = index;
        room.currentVideoId = room.playlist[index].videoId;
        room.isPlaying = true;
        room.playbackTimestamp = 0;
        room.lastUpdatedAt = Date.now();

        // 廣播給所有人同步跳轉
        io.in(roomId).emit("videoChanged", room);
      }
    },
  );

  // 拿取訊息
  socket.on("getMessages", (roomId: string) => {
    const room = rooms.get(roomId);
    if (room && room.messages) {
      socket.emit("historyMessages", room.messages);
    }
  });
  // 傳送訊息
  socket.on(
    "sendMessage",
    ({
      roomId,
      user,
      text,
    }: {
      roomId: string;
      user: { uid: string; displayName: string; photoURL: string };
      text: string;
    }) => {
      const room = rooms.get(roomId);
      if (room) {
        const newMessage = {
          id: Date.now(),
          uid: user.uid || "",
          displayName: user.displayName || "訪客",
          text,
          timestamp: new Date().toLocaleTimeString(),
        };

        // 1. 初始化房間的訊息陣列 (如果還沒有的話)
        if (!room.messages) {
          room.messages = [];
        }

        // 2. 將訊息存入該房間的陣列中
        room.messages.push(newMessage);

        // 3. 限制紀錄長度 (例如只保留最近 50 條，防止記憶體爆掉)
        if (room.messages.length > 50) {
          room.messages.shift();
        }

        // 4. 廣播給房間內所有人
        io.to(roomId).emit("receiveMessage", newMessage);
      }
    },
  );

  // 離開
  socket.on("exitParty", ({ roomId }: { roomId: string }) => {
    // 讓這個 socket 退出該房間群組
    socket.leave(roomId);
    console.log(`🏃 使用者 ${socket.id} 離開了房間: ${roomId}`);

    const room = rooms.get(roomId);

    const hasMember = room?.members.some((m: any) => m.socketId === socket.id);

    if (room && hasMember) {
      // 將該成員從名單中過濾掉（清除）
      room.members = room.members.filter((m: any) => m.socketId !== socket.id);
      console.log(
        `已將離線使用者從房間 [${roomId}] 移除。剩餘人數: ${room.members.length}`,
      );

      // 💡 最佳實踐 A：如果房間空了，就把房間整台銷毀，釋放伺服器記憶體
      if (room.members.length === 0) {
        rooms.delete(roomId);
        console.log(`🏠 房間 [${roomId}] 已無人，自動銷毀。`);
      }
      // 💡 最佳實踐 B：如果房間還有人，立刻廣播最新名單給房間內剩下的所有人
      else {
        socket.emit("roomDataSync", room);
      }
    }
  });

  // 斷線
  socket.on("disconnect", () => {
    console.log(`❌ 連線中斷: ${socket.id}`);

    // 遍歷後端記憶體裡所有的房間
    rooms.forEach((room, roomId) => {
      // 檢查這個斷線的 socket.id 是否在該房間的成員名單中
      const hasMember = room.members.some((m: any) => m.socketId === socket.id);

      if (hasMember) {
        // 將該成員從名單中過濾掉（清除）
        room.members = room.members.filter(
          (m: any) => m.socketId !== socket.id,
        );
        console.log(
          `已將離線使用者從房間 [${roomId}] 移除。剩餘人數: ${room.members.length}`,
        );

        // 💡 最佳實踐 A：如果房間空了，就把房間整台銷毀，釋放伺服器記憶體
        if (room.members.length === 0) {
          rooms.delete(roomId);
          console.log(`🏠 房間 [${roomId}] 已無人，自動銷毀。`);
        }
        // 💡 最佳實踐 B：如果房間還有人，立刻廣播最新名單給房間內剩下的所有人
        else {
          socket.emit("roomDataSync", room);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 伺服器運行於 ${PORT}`);
});
