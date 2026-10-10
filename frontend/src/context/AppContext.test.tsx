// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import type { AuthUser } from '../services/authApi';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
const mocks=vi.hoisted(()=>({restore:vi.fn(),login:vi.fn(),activity:vi.fn(),items:vi.fn(),mark:vi.fn(),action:vi.fn()}));
vi.mock('../services/authApi',()=>({restoreAuthSession:mocks.restore,login:mocks.login,signup:vi.fn()}));
vi.mock('../services/activityApi',()=>({loadActivity:mocks.activity,markActivityRead:mocks.mark,returnAction:mocks.action,createReturn:vi.fn(),describeActivityError:()=> '서버 기록을 불러오지 못했어요.'}));
vi.mock('../services/itemApi',()=>({listAllServerItems:mocks.items}));
const a:AuthUser={id:1,email:'a@example.com',nickname:'A',role:'USER'};
const b:AuthUser={id:2,email:'b@example.com',nickname:'B',role:'USER'};
const snapshot=(name:string,xp:number)=>({profile:{name,xp,registeredCount:0,returnedCount:0},requests:[],relatedItems:[],notifications:[{id:name,title:name+' 개인알림',message:'비공개',read:false,createdAt:'2026-10-01T00:00:00Z'}]});
let current:ReturnType<typeof useApp>; let container:HTMLDivElement; let root:Root;
function Probe(){current=useApp();return <div>{current.profile.name}:{current.profile.xp}:{current.notifications.map(n=>n.title).join(',')}</div>;}
async function settle(){for(let i=0;i<4;i++) await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
beforeEach(async()=>{
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.restore.mockResolvedValue({user:a,expiresAt:Date.now()+60000});
  mocks.items.mockResolvedValue([]); mocks.activity.mockResolvedValue(snapshot('A',60));
  mocks.login.mockResolvedValue({user:b,accessToken:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyIn0.c2ln',expiresIn:3600});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>{root.render(<AppProvider><Probe/></AppProvider>);}); await settle();
});
afterEach(()=>{act(()=>root.unmount());container.remove();sessionStorage.clear();});
it('loads real profile values instead of seeded XP and clears private records on logout',async()=>{
  expect(container.textContent).toBe('A:60:A 개인알림');
  await act(async()=>{current.logout();});await settle();
  expect(container.textContent).toBe('방문자:0:');
});
it('ignores a late response from the previous account',async()=>{
  let resolveA!:(value:ReturnType<typeof snapshot>)=>void;
  mocks.activity.mockImplementationOnce(()=>new Promise(resolve=>{resolveA=resolve;})).mockResolvedValue(snapshot('B',10));
  let pending!:Promise<void>;
  await act(async()=>{pending=current.refreshData();});
  await act(async()=>{current.logout();});await settle();
  await act(async()=>{await current.login('b@example.com','Quest1234!');});await settle();
  expect(container.textContent).toBe('B:10:B 개인알림');
  await act(async()=>{resolveA(snapshot('A',999));await pending;});await settle();
  expect(container.textContent).toBe('B:10:B 개인알림');
});
it('does not fabricate a successful update when the server fails',async()=>{
  mocks.action.mockRejectedValue(new Error('database down'));
  await expect(current.completeReturn('4')).rejects.toThrow('database down');
  expect(container.textContent).toBe('A:60:A 개인알림');
});
