// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthSession, saveAuthSession } from './authSession';
import { createReturn, loadActivity, markActivityRead, parseReturn, returnAction, setupOwnership } from './activityApi';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyIn0.c2ln';
const found = { id: 7, userId: 3, title: '지갑', category: '지갑', color: '검정', location: '서울역',
  region: '서울', description: '지갑입니다', foundDate: '2026-10-01', status: 'STORED',
  ownershipQuestion: '내부 색상은?', ownershipConfigured: true };
const request = { id: 4, requesterId: 2, finderId: 3, foundItem: found, lostItem: null,
  status: 'APPROVED', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T01:00:00Z', qrToken: 'random-token', qrExpiresAt: '2026-10-01T01:30:00Z' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {vi.stubEnv('VITE_API_BASE_URL','http://localhost:8080'); saveAuthSession(TOKEN,3600);});
afterEach(() => {clearAuthSession(); vi.unstubAllGlobals(); vi.unstubAllEnvs();});
describe('account activity API', () => {
  it('loads DB profile, return and notification fields without carrying an ownership answer into state', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({
      profile: {name:'회원',xp:60,registeredCount:1,returnedCount:1},
      requests:[{...request,foundItem:{...found,ownershipAnswer:'must-not-be-kept'}}],
      notifications:[{id:1,title:'반환 완료',message:'저장됨',createdAt:'2026-10-01T00:00:00Z',read:false}],
    })));
    const activity=await loadActivity();
    expect(activity.profile.xp).toBe(60);
    expect(activity.requests[0]).toMatchObject({id:'4',itemId:'api-found-7',status:'approved',qrToken:'random-token'});
    expect(activity.notifications[0].read).toBe(false);
    expect(activity.relatedItems[0]).not.toHaveProperty('ownershipAnswer');
  });
  it('creates a request with server item ids and the auth header', async () => {
    const fetch=vi.fn().mockResolvedValue(json({...request,status:'PENDING',qrToken:null},201)); vi.stubGlobal('fetch',fetch);
    await createReturn('api-found-7','api-lost-12');
    const [url,init]=fetch.mock.calls[0] as [string,RequestInit];
    expect(url).toBe('http://localhost:8080/api/returns');
    expect(init.headers).toMatchObject({Authorization:'Bearer '+TOKEN});
    expect(JSON.parse(String(init.body))).toEqual({foundItemId:7,lostItemId:12});
  });
  it('rejects demo or police item ids without creating a local return', async () => {
    const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(createReturn('found-wallet-1')).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(createReturn('api-found-7','api-found-12')).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('passes QR credentials in the authenticated body, never in the URL', async () => {
    const fetch=vi.fn().mockResolvedValue(json({...request,status:'QR_VERIFIED',qrToken:null})); vi.stubGlobal('fetch',fetch);
    await returnAction('4','verify-qr',{token:'secret'});
    const [url,init]=fetch.mock.calls[0] as [string,RequestInit];
    expect(url).toBe('http://localhost:8080/api/returns/4/verify-qr');
    expect(JSON.parse(String(init.body))).toEqual({token:'secret'});
    await expect(returnAction('../4','complete')).rejects.toMatchObject({code:'INVALID_INPUT'});
  });
  it('does not fall back to browser state after a server rejection', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({message:'승인 권한이 없습니다.'},403)));
    await expect(returnAction('4','approve')).rejects.toMatchObject({status:403,message:'승인 권한이 없습니다.'});
  });
  it('persists read status and ownership setup via the server', async () => {
    const fetch=vi.fn().mockResolvedValueOnce(json({success:true})).mockResolvedValueOnce(json(found)); vi.stubGlobal('fetch',fetch);
    await markActivityRead(); await setupOwnership(7,'내부 색상은?','파란색');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8080/api/me/activity/read-all');
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8080/api/found-items/7/ownership');
  });
  it.each([null,{...request,id:0},{...request,status:'UNKNOWN'},{...request,foundItem:null}])('rejects malformed return responses %#',body=>{
    expect(()=>parseReturn(body)).toThrow();
  });
});
