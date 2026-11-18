const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Render 헬스체크용 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', online: activeRoom.members.size });
});

const INITIAL_SUPPORT_FUND = 1000000; // 신규 가입 기본 지원금 100만원

// 활성 방 상태 (서버는 실시간 주가 생성 및 방 통신 중계만 담당, 영구 저장은 클라이언트 localStorage에서 수행)
let activeRoom = {
  roomId: null,
  hostSocketId: null,
  members: new Map() // socket.id -> { nickname, cash, totalPrincipal, lastLoginDate, streak, portfolio }
};

// 국내(KR) 25종목 + 해외(US) 25종목 (총 50종목, 모두 원화 환산가 기준)
const INITIAL_STOCKS = [
  // 국내 주식 (KR) - 25개
  { id: 'KR_SAMSUNG',   market: 'KR', marketName: '국내주식', code: '005930', name: '삼성전자', price: 72000 },
  { id: 'KR_SKHYNIX',   market: 'KR', marketName: '국내주식', code: '000660', name: 'SK하이닉스', price: 185000 },
  { id: 'KR_NAVER',     market: 'KR', marketName: '국내주식', code: '035420', name: 'NAVER', price: 192000 },
  { id: 'KR_KAKAO',     market: 'KR', marketName: '국내주식', code: '035720', name: '카카오', price: 43500 },
  { id: 'KR_HYUNDAI',   market: 'KR', marketName: '국내주식', code: '005380', name: '현대차', price: 245000 },
  { id: 'KR_KIA',       market: 'KR', marketName: '국내주식', code: '000270', name: '기아', price: 108000 },
  { id: 'KR_LGES',      market: 'KR', marketName: '국내주식', code: '373220', name: 'LG에너지솔루션', price: 380000 },
  { id: 'KR_POSCO',     market: 'KR', marketName: '국내주식', code: '005490', name: 'POSCO홀딩스', price: 365000 },
  { id: 'KR_CELLTRION', market: 'KR', marketName: '국내주식', code: '068270', name: '셀트리온', price: 178000 },
  { id: 'KR_KB',        market: 'KR', marketName: '국내주식', code: '105560', name: 'KB금융', price: 82000 },
  { id: 'KR_SHINHAN',   market: 'KR', marketName: '국내주식', code: '055550', name: '신한지주', price: 54000 },
  { id: 'KR_HANMI',     market: 'KR', marketName: '국내주식', code: '042700', name: '한미반도체', price: 112000 },
  { id: 'KR_ECOPRO',    market: 'KR', marketName: '국내주식', code: '086520', name: '에코프로', price: 89000 },
  { id: 'KR_KRAFTON',   market: 'KR', marketName: '국내주식', code: '259960', name: '크래프톤', price: 295000 },
  { id: 'KR_NEXON',     market: 'KR', marketName: '국내주식', code: '225570', name: '넥슨게임즈', price: 16500 },
  { id: 'KR_NC',        market: 'KR', marketName: '국내주식', code: '036570', name: '엔씨소프트', price: 198000 },
  { id: 'KR_HYBE',      market: 'KR', marketName: '국내주식', code: '352820', name: '하이브', price: 210000 },
  { id: 'KR_SM',        market: 'KR', marketName: '국내주식', code: '041510', name: '에스엠', price: 76000 },
  { id: 'KR_JYP',       market: 'KR', marketName: '국내주식', code: '035900', name: 'JYP Ent.', price: 64000 },
  { id: 'KR_KOREAAIR',  market: 'KR', marketName: '국내주식', code: '003490', name: '대한항공', price: 23500 },
  { id: 'KR_DOOSAN',    market: 'KR', marketName: '국내주식', code: '034020', name: '두산에너빌리티', price: 19200 },
  { id: 'KR_HANWHA',    market: 'KR', marketName: '국내주식', code: '012450', name: '한화에어로스페이스', price: 310000 },
  { id: 'KR_KAKAO_BK',  market: 'KR', marketName: '국내주식', code: '323410', name: '카카오뱅크', price: 22800 },
  { id: 'KR_WOORI',     market: 'KR', marketName: '국내주식', code: '316140', name: '우리금융지주', price: 15400 },
  { id: 'KR_DAEDUCK',   market: 'KR', marketName: '국내주식', code: '353200', name: '대덕전자', price: 8500 },

  // 해외 주식 (US) - 25개 (원화 환산가)
  { id: 'US_NVDA',      market: 'US', marketName: '해외주식', code: 'NVDA',   name: '엔비디아', price: 185000 },
  { id: 'US_AAPL',      market: 'US', marketName: '해외주식', code: 'AAPL',   name: '애플', price: 312000 },
  { id: 'US_MSFT',      market: 'US', marketName: '해외주식', code: 'MSFT',   name: '마이크로소프트', price: 580000 },
  { id: 'US_TSLA',      market: 'US', marketName: '해외주식', code: 'TSLA',   name: '테슬라', price: 345000 },
  { id: 'US_GOOGL',     market: 'US', marketName: '해외주식', code: 'GOOGL',  name: '알파벳 A', price: 238000 },
  { id: 'US_AMZN',      market: 'US', marketName: '해외주식', code: 'AMZN',   name: '아마존', price: 265000 },
  { id: 'US_META',      market: 'US', marketName: '해외주식', code: 'META',   name: '메타 플랫폼스', price: 740000 },
  { id: 'US_AMD',       market: 'US', marketName: '해외주식', code: 'AMD',    name: 'AMD', price: 215000 },
  { id: 'US_AVGO',      market: 'US', marketName: '해외주식', code: 'AVGO',   name: '브로드컴', price: 242000 },
  { id: 'US_NFLX',      market: 'US', marketName: '해외주식', code: 'NFLX',   name: '넷플릭스', price: 960000 },
  { id: 'US_PLTR',      market: 'US', marketName: '해외주식', code: 'PLTR',   name: '팔란티어', price: 58000 },
  { id: 'US_COIN',      market: 'US', marketName: '해외주식', code: 'COIN',   name: '코인베이스', price: 285000 },
  { id: 'US_INTC',      market: 'US', marketName: '해외주식', code: 'INTC',   name: '인텔', price: 31000 },
  { id: 'US_QCOM',      market: 'US', marketName: '해외주식', code: 'QCOM',   name: '퀄컴', price: 230000 },
  { id: 'US_ARM',       market: 'US', marketName: '해외주식', code: 'ARM',    name: 'ARM 홀딩스', price: 195000 },
  { id: 'US_DIS',       market: 'US', marketName: '해외주식', code: 'DIS',    name: '월트 디즈니', price: 132000 },
  { id: 'US_KO',        market: 'US', marketName: '해외주식', code: 'KO',     name: '코카콜라', price: 88000 },
  { id: 'US_SBUX',      market: 'US', marketName: '해외주식', code: 'SBUX',   name: '스타벅스', price: 128000 },
  { id: 'US_NKE',       market: 'US', marketName: '해외주식', code: 'NKE',    name: '나이키', price: 112000 },
  { id: 'US_UBER',      market: 'US', marketName: '해외주식', code: 'UBER',   name: '우버', price: 98000 },
  { id: 'US_SOFI',      market: 'US', marketName: '해외주식', code: 'SOFI',   name: '소파이 테크놀로지', price: 14500 },
  { id: 'US_RIVN',      market: 'US', marketName: '해외주식', code: 'RIVN',   name: '리비안', price: 16200 },
  { id: 'US_LCID',      market: 'US', marketName: '해외주식', code: 'LCID',   name: '루시드 그룹', price: 3800 },
  { id: 'US_NIO',       market: 'US', marketName: '해외주식', code: 'NIO',    name: '니오', price: 7200 },
  { id: 'US_SNAP',      market: 'US', marketName: '해외주식', code: 'SNAP',   name: '스냅', price: 15800 }
];

const stocks = {};
for (const item of INITIAL_STOCKS) {
  stocks[item.id] = {
    ...item,
    prevPrice: item.price
  };
}

// 한국 시간(KST) 기준 YYYY-MM-DD 문자열 반환
function getDateString(offsetDays = 0) {
  const targetTime = Date.now() + offsetDays * 86400000;
  return new Date(targetTime).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

// 총자산 계산 (보유 현금 + 보유 주식 현재 평가액)
function calculateTotalAssets(user) {
  let stockValue = 0;
  if (user && user.portfolio) {
    for (const [stockId, holding] of Object.entries(user.portfolio)) {
      if (stocks[stockId] && holding && holding.qty > 0) {
        stockValue += holding.qty * stocks[stockId].price;
      }
    }
  }
  return (Number(user.cash) || 0) + stockValue;
}

// 수익률 계산: ((총자산 - 총 지급 원금) / 총 지급 원금) * 100
function calculateReturnRate(user, totalAssets) {
  const principal = (typeof user.totalPrincipal === 'number' && user.totalPrincipal > 0)
    ? user.totalPrincipal
    : INITIAL_SUPPORT_FUND;
  return ((totalAssets - principal) / principal) * 100;
}

// 클라이언트에서 전달받은 localStorage 프로필 데이터 정제
function sanitizeProfile(nickname, rawProfile) {
  const p = (rawProfile && typeof rawProfile === 'object') ? rawProfile : {};
  const isNew = typeof p.cash !== 'number' || isNaN(p.cash);

  const sanitizedPortfolio = {};
  if (p.portfolio && typeof p.portfolio === 'object') {
    for (const [stockId, item] of Object.entries(p.portfolio)) {
      const stockMeta = stocks[stockId];
      const qty = parseInt(item && item.qty, 10);
      const avgPrice = Number(item && item.avgPrice);
      if (stockMeta && !isNaN(qty) && qty > 0 && !isNaN(avgPrice) && avgPrice > 0) {
        sanitizedPortfolio[stockId] = {
          id: stockMeta.id,
          market: stockMeta.market,
          marketName: stockMeta.marketName,
          code: stockMeta.code,
          name: stockMeta.name,
          avgPrice: Math.round(avgPrice),
          qty,
          totalBuyAmount: Math.round(avgPrice) * qty,
          firstBoughtAt: item.firstBoughtAt || null,
          lastUpdatedAt: item.lastUpdatedAt || null
        };
      }
    }
  }

  const cash = isNew ? INITIAL_SUPPORT_FUND : Math.max(0, Math.round(p.cash));
  let totalPrincipal = (typeof p.totalPrincipal === 'number' && p.totalPrincipal > 0)
    ? Math.round(p.totalPrincipal)
    : 0;

  if (totalPrincipal <= 0) {
    let holdingsCost = 0;
    for (const h of Object.values(sanitizedPortfolio)) {
      holdingsCost += h.totalBuyAmount;
    }
    totalPrincipal = Math.max(INITIAL_SUPPORT_FUND, cash + holdingsCost);
  }

  return {
    isNew,
    profile: {
      nickname,
      cash,
      totalPrincipal,
      lastLoginDate: typeof p.lastLoginDate === 'string' ? p.lastLoginDate : null,
      streak: Math.max(0, parseInt(p.streak, 10) || 0),
      portfolio: sanitizedPortfolio
    }
  };
}

// 현재 방에 접속 중인 유저들의 랭킹 및 방 상태 브로드캐스트
function broadcastRoomState() {
  if (!activeRoom.roomId || activeRoom.members.size === 0) return;

  const hostMember = activeRoom.hostSocketId
    ? activeRoom.members.get(activeRoom.hostSocketId)
    : null;
  const hostNickname = hostMember ? hostMember.nickname : null;

  const ranking = [];
  for (const [socketId, member] of activeRoom.members.entries()) {
    const totalAssets = calculateTotalAssets(member);
    const returnRate = calculateReturnRate(member, totalAssets);
    ranking.push({
      nickname: member.nickname,
      isHost: socketId === activeRoom.hostSocketId,
      totalAssets,
      totalPrincipal: member.totalPrincipal,
      returnRate,
      cash: member.cash,
      streak: member.streak
    });
  }

  ranking.sort((a, b) => b.totalAssets - a.totalAssets);

  io.to(activeRoom.roomId).emit('roomUpdate', {
    roomId: activeRoom.roomId,
    hostNickname,
    onlineCount: activeRoom.members.size,
    ranking,
    currentDate: getDateString(0)
  });
}

// 2초마다 전 종목(국내/해외 50종목) 주가 실시간 변동
setInterval(() => {
  for (const stock of Object.values(stocks)) {
    stock.prevPrice = stock.price;
    const changeRate = (Math.random() - 0.495) * 0.07;
    const nextPrice = Math.round((stock.price * (1 + changeRate)) / 10) * 10;
    stock.price = Math.max(500, nextPrice);
  }

  if (activeRoom.roomId && activeRoom.members.size > 0) {
    io.to(activeRoom.roomId).emit('stockUpdate', stocks);
    broadcastRoomState();
  }
}, 2000);

io.on('connection', (socket) => {
  // 1. 방 입장 (클라이언트 localStorage 데이터를 받아 출석 체크 후 room 세션에 등록)
  socket.on('join', (payload) => {
    const rawNickname = typeof payload === 'string' ? payload : (payload && payload.nickname);
    const rawProfile = typeof payload === 'object' && payload !== null ? payload.profile : null;

    const nickname = String(rawNickname || '').trim();
    if (!nickname) {
      return socket.emit('errorMsg', '닉네임을 입력해주세요.');
    }

    // 현재 방에 이미 접속 중인 닉네임 중복 방지
    for (const [sid, member] of activeRoom.members.entries()) {
      if (sid !== socket.id && member.nickname === nickname) {
        return socket.emit('errorMsg', '이미 현재 방에 접속 중인 닉네임입니다.');
      }
    }

    const { isNew, profile } = sanitizeProfile(nickname, rawProfile);
    const today = getDateString(0);
    const yesterday = getDateString(-1);
    const prevLoginDate = profile.lastLoginDate;
    const initialSupport = isNew ? INITIAL_SUPPORT_FUND : 0;
    let attendanceLog = null;

    // 출석 보상 판정 (KST 기준 하루 1회, 3일 연속 출석부터 2배 = 20,000원)
    if (profile.lastLoginDate !== today) {
      if (profile.lastLoginDate === yesterday) {
        profile.streak += 1;
      } else {
        profile.streak = 1;
      }

      const reward = profile.streak >= 3 ? 20000 : 10000;
      profile.cash += reward;
      profile.totalPrincipal += reward;
      profile.lastLoginDate = today;

      attendanceLog = {
        rewarded: true,
        streak: profile.streak,
        reward,
        prevLoginDate: prevLoginDate || '첫 방문'
      };
    } else {
      attendanceLog = {
        rewarded: false,
        streak: profile.streak,
        reward: 0,
        prevLoginDate: today
      };
    }

    // 방에 아무도 없으면 처음 들어온 사람이 방을 열고 방 주인(통신 호스트)이 됨
    let joinRoleMsg = '';
    if (activeRoom.members.size === 0 || !activeRoom.roomId) {
      activeRoom.roomId = `room_${Date.now().toString(36)}`;
      activeRoom.hostSocketId = socket.id;
      joinRoleMsg = '빈 방에 첫 번째로 입장하여 방 주인(통신 호스트)이 되었습니다.';
    } else {
      const hostMember = activeRoom.members.get(activeRoom.hostSocketId);
      const hostNick = hostMember ? hostMember.nickname : '방 주인';
      joinRoleMsg = `방 주인 [${hostNick}]님이 연 방에 접속했습니다.`;
    }

    socket.join(activeRoom.roomId);
    activeRoom.members.set(socket.id, profile);

    // 확정된 프로필을 클라이언트에 회신 -> 클라이언트가 즉시 localStorage에 영구 저장
    socket.emit('joined', {
      nickname,
      user: profile,
      stocks,
      initialSupport,
      attendanceLog,
      isHost: socket.id === activeRoom.hostSocketId,
      roomId: activeRoom.roomId,
      joinRoleMsg
    });

    io.to(activeRoom.roomId).emit('systemNotice', `[입장] ${nickname}님이 방에 참여했습니다.`);
    broadcastRoomState();
  });

  // 2. 주식 매수 (현재 서버 주가 기준으로 계산 후 클라이언트 localStorage 저장용 확정 데이터 반환)
  socket.on('buy', ({ stockId, qty }) => {
    const member = activeRoom.members.get(socket.id);
    const amount = parseInt(qty, 10);
    if (!member || !stocks[stockId] || isNaN(amount) || amount <= 0) return;

    const stock = stocks[stockId];
    const execPrice = stock.price;
    const totalCost = execPrice * amount;

    if (member.cash < totalCost) {
      return socket.emit('errorMsg', `보유 현금이 부족합니다. (필요 금액: ${totalCost.toLocaleString()}원)`);
    }

    const nowISO = new Date().toISOString();
    const existing = member.portfolio[stockId];

    if (!existing) {
      member.portfolio[stockId] = {
        id: stock.id,
        market: stock.market,
        marketName: stock.marketName,
        code: stock.code,
        name: stock.name,
        avgPrice: execPrice,
        qty: amount,
        totalBuyAmount: totalCost,
        firstBoughtAt: nowISO,
        lastUpdatedAt: nowISO
      };
    } else {
      const totalPrevCost = existing.qty * existing.avgPrice;
      const newQty = existing.qty + amount;
      const newAvgPrice = Math.round((totalPrevCost + totalCost) / newQty);
      existing.avgPrice = newAvgPrice;
      existing.qty = newQty;
      existing.totalBuyAmount = newAvgPrice * newQty;
      existing.lastUpdatedAt = nowISO;
    }

    member.cash -= totalCost;

    socket.emit('userUpdate', {
      user: member,
      tradeRecord: {
        type: 'BUY',
        stockId: stock.id,
        market: stock.market,
        marketName: stock.marketName,
        code: stock.code,
        name: stock.name,
        price: execPrice,
        qty: amount,
        totalAmount: totalCost,
        timestamp: nowISO
      }
    });
    socket.emit('tradeSuccess', `${stock.name} ${amount}주 매수 완료! (로컬 스토리지 저장됨)`);
    broadcastRoomState();
  });

  // 3. 주식 매도 (현재 서버 주가 기준으로 계산 후 클라이언트 localStorage 저장용 확정 데이터 반환)
  socket.on('sell', ({ stockId, qty }) => {
    const member = activeRoom.members.get(socket.id);
    const amount = parseInt(qty, 10);
    if (!member || !stocks[stockId] || isNaN(amount) || amount <= 0) return;

    const stock = stocks[stockId];
    const holding = member.portfolio[stockId];

    if (!holding || holding.qty < amount) {
      return socket.emit('errorMsg', '보유 수량이 부족합니다.');
    }

    const execPrice = stock.price;
    const totalProceeds = execPrice * amount;
    const nowISO = new Date().toISOString();

    member.cash += totalProceeds;
    holding.qty -= amount;

    if (holding.qty === 0) {
      delete member.portfolio[stockId];
    } else {
      holding.totalBuyAmount = holding.avgPrice * holding.qty;
      holding.lastUpdatedAt = nowISO;
    }

    socket.emit('userUpdate', {
      user: member,
      tradeRecord: {
        type: 'SELL',
        stockId: stock.id,
        market: stock.market,
        marketName: stock.marketName,
        code: stock.code,
        name: stock.name,
        price: execPrice,
        qty: amount,
        totalAmount: totalProceeds,
        timestamp: nowISO
      }
    });
    socket.emit('tradeSuccess', `${stock.name} ${amount}주 매도 완료! (로컬 스토리지 저장됨)`);
    broadcastRoomState();
  });

  // 4. 접속 종료 처리 (방 주인 퇴장 시 다음 접속자에게 통신 호스트 역할 인계)
  socket.on('disconnect', () => {
    if (!activeRoom.members.has(socket.id)) return;
    const leftMember = activeRoom.members.get(socket.id);
    const leftNick = leftMember.nickname;
    activeRoom.members.delete(socket.id);

    if (activeRoom.members.size === 0) {
      activeRoom.roomId = null;
      activeRoom.hostSocketId = null;
      return;
    }

    if (socket.id === activeRoom.hostSocketId) {
      activeRoom.hostSocketId = activeRoom.members.keys().next().value;
      const newHostMember = activeRoom.members.get(activeRoom.hostSocketId);
      const newHostNick = newHostMember ? newHostMember.nickname : '방 주인';
      io.to(activeRoom.hostSocketId).emit('hostAssigned');
      io.to(activeRoom.roomId).emit(
        'systemNotice',
        `[퇴장] 방 주인 ${leftNick}님이 퇴장하여 ${newHostNick}님이 방 주인(통신 호스트) 역할을 이어받았습니다.`
      );
    } else {
      io.to(activeRoom.roomId).emit('systemNotice', `[퇴장] ${leftNick}님이 방을 나갔습니다.`);
    }

    broadcastRoomState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`실시간 주식 경쟁 서버 실행 중: http://localhost:${PORT}`);
});
