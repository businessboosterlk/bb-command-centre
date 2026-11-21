// H3 pass mark: 30 test sentences read person, day and client right.
// Run: node handoff/parts/h3-reader.test.mjs   (today fixed at Monday 9 Nov 2026)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('./h3-reader.js', import.meta.url), 'utf8');
const box = { window: {} }; box.window = box; vm.createContext(box); vm.runInContext(src, box);
const hoRead = box.hoRead;
const people = [['USHANE',5],['NIRVANA',12],['FARHATH',17],['SUHANA',3],['TIANA',22],['HITHESH',29],['THULAIB',23],['SHIARA',24],['AMJATH',18],['KISHINI',25]].map(([name,id])=>({id,name}));
// the active client list read from clients on 8 Nov 2026 (status active), ids made up for the test
const clients = ['BELLVANTAGE','BIO SOLV','BS WITH LEON','C-CLARKE','CEYLON CARRIER TRAVELS','CHERRY FISH','CHERRY KITCHEN','CLOVE WADDUWA','CRAB ISLAND','FUSION','HIRE PANTHER','HOMEDEPOT','LEARNOVA','MIRCHIZ','POT BIRIYANI','PUWAKARAMBA','SASTHO','SHOW CAR DETAILERS','SQUARE 1 AI','SUN ZAPPER','TT MOBILE','UMMAT','WAVERLEY'].map((name,i)=>({id:i+1,name}));
const C = n => clients.find(c=>c.name===n).id;
const ctx = { people, clients, today: '2026-11-09' };
const T = [
 ['Ushane, cut the Sastho reel by Friday', [5], '2026-11-13', C('SASTHO')],
 ['Nirvana and Farhath: Waverley carousel tomorrow', [12,17], '2026-11-10', C('WAVERLEY')],
 ['Farhath can you redo the CCT banner by 12 Nov', [17], '2026-11-12', C('CEYLON CARRIER TRAVELS')],
 ['Tiana post the Cherry stories next Friday', [22], '2026-11-20', null],
 ['Suhana, c clarke menu card in 3 days', [3], '2026-11-12', C('C-CLARKE')],
 ['Ushane check audio on the 5th', [5], '2026-12-05', null],
 ['Nirvana reply to the Pot Biriyani comments today', [12], '2026-11-09', C('POT BIRIYANI')],
 ['ushane please colour grade the Homedepot shoot by wed', [5], '2026-11-11', C('HOMEDEPOT')],
 ['Farhath, Sun Zapper logo files', [17], '', C('SUN ZAPPER')],
 ['Nirvana, Ushane and Farhath: plan the Learnova launch next week', [12,5,17], '2026-11-16', C('LEARNOVA')],
 ['Hithesh send the Mirchiz captions by end of day', [29], '2026-11-09', C('MIRCHIZ')],
 ['Tiana Bellvantage report by the 20th', [22], '2026-11-20', C('BELLVANTAGE')],
 ['Amjath, Square 1 AI banner in two days', [18], '2026-11-11', C('SQUARE 1 AI')],
 ['Kishini fix the Show Car Detailers site tmrw', [25], '2026-11-10', C('SHOW CAR DETAILERS')],
 ['Ushane edit the Crab Island reel by 15/11', [5], '2026-11-15', C('CRAB ISLAND')],
 ['Nirvana TT Mobile content plan on Nov 18', [12], '2026-11-18', C('TT MOBILE')],
 ['Farhath: Cherry Kitchen menu this week', [17], '2026-11-13', C('CHERRY KITCHEN')],
 ['Suhana redo the Cherry Fish post on Thursday', [3], '2026-11-12', C('CHERRY FISH')],
 ['Shiara, check the Ummat invoice tomorrow', [24], '2026-11-10', C('UMMAT')],
 ['Thulaib approve the Bio Solv script by 3 Dec', [23], '2026-12-03', C('BIO SOLV')],
 ['Ushane, Clove Wadduwa drone shots in a week', [5], '2026-11-16', C('CLOVE WADDUWA')],
 ['Nirvana call Hire Panther about the shoot on Saturday', [12], '2026-11-14', C('HIRE PANTHER')],
 ['Farhath fix the Fusion banner', [17], '', C('FUSION')],
 ['Tiana post the Puwakaramba stories on the 2nd', [22], '2026-12-02', C('PUWAKARAMBA')],
 ['Ushane back up the drive by Monday', [5], '2026-11-09', null],
 ['Nirvana BS With Leon reel captions by 10 November', [12], '2026-11-10', C('BS WITH LEON')],
 ['Farhath the Ceylon brochure next Tuesday', [17], '2026-11-17', C('CEYLON CARRIER TRAVELS')],
 ['Ushane, Sastho and Waverley reels by Friday', [5], '2026-11-13', C('WAVERLEY')],
 ['Hithesh and Tiana schedule the May posts for Sun Zapper', [29,22], '', C('SUN ZAPPER')],
 ['Suhana, new story template on 1/1', [3], '2027-01-01', null],
];
let bad = 0;
for (const [s, p, d, c] of T) {
  const r = hoRead(s, ctx);
  const ok = JSON.stringify(Array.from(r.people)) === JSON.stringify(p) && r.due === d && r.client === c;
  if (!ok) bad++;
  console.log((ok ? 'PASS ' : 'FAIL ') + s + (ok ? '' : `  got people ${JSON.stringify(Array.from(r.people))} due '${r.due}' client ${r.client}; want ${JSON.stringify(p)} '${d}' ${c}`) + `  | title: ${r.title}`);
}
console.log(bad ? `RESULT: ${bad} of ${T.length} FAIL` : `RESULT: ALL ${T.length} PASS`);
process.exit(bad ? 1 : 0);
