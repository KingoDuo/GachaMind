// 제시어 사전. 지금은 하드코딩이고, 나중에 난이도별 분리나 외부 소스로 옮길 수 있다.
const WORDS = [
  "사과", "바나나", "고양이", "강아지", "자전거", "비행기", "우산", "안경",
  "피아노", "기타", "축구공", "냉장고", "선풍기", "컴퓨터", "휴대폰", "시계",
  "코끼리", "기린", "펭귄", "상어", "무지개", "눈사람", "케이크", "피자",
  "햄버거", "커피", "로켓", "등대", "다리", "성", "왕관", "보물상자",
];

/** 방금 쓴 제시어를 제외하고 무작위로 하나 고른다. */
export function pickWord(exclude: readonly string[] = []): string {
  const pool = WORDS.filter((word) => !exclude.includes(word));
  const candidates = pool.length > 0 ? pool : WORDS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
