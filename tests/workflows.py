import json, urllib.request, urllib.error, http.cookiejar
BASE='http://127.0.0.1:8787'
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path,body=None,method='POST',expect=200,origin=BASE):
  req=urllib.request.Request(BASE+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','Origin':origin},method=method if body is not None else 'GET')
  try:r=self.opener.open(req);code=r.status;data=json.load(r)
  except urllib.error.HTTPError as e:code=e.code;data=json.load(e)
  assert code==expect,(path,code,data)
  return data
admin,ops,a,b,anon=[Client() for _ in range(5)]
anon.call('leads',expect=401)
admin.call('login',{'username':'admin','password':'Yifun-Local-Review-2026!'})
for name,role in [('testops','operations'),('testa','sales'),('testb','sales')]:admin.call('users',{'username':name,'name':name,'role':role,'password':'Test-Password-2026!'})
for client,name in [(ops,'testops'),(a,'testa'),(b,'testb')]:client.call('login',{'username':name,'password':'Test-Password-2026!'})
ids={u['username']:u['id'] for u in admin.call('users')}
ops.call('users',{'username':'forbidden','name':'x','role':'sales','password':'Test-Password-2026!'},expect=403)
a.call('import',{'source':'Meta','rows':[]},expect=403)
rows=[{'客户名称':'测试客户甲','联系方式':'+1 202 555 0101','所在国家/地区':'测试国家'},{'客户名称':'测试客户乙','邮箱':'test-b@example.com'}]
r=ops.call('import',{'source':'Meta','filename':'权限测试','rows':rows});assert r['inserted']==2
r=ops.call('import',{'source':'Meta','filename':'权限测试','rows':rows});assert r['inserted']==0 and r['skipped']==2
r=ops.call('import',{'source':'独立站','rows':[rows[0]]});assert r['reviewed']==1
leads=ops.call('leads');first=next(l for l in leads if l['name']=='测试客户甲' and l['source']=='Meta');second=next(l for l in leads if l['name']=='测试客户乙');dup=next(l for l in leads if l['source']=='独立站')
ops.call('assign',{'ids':[dup['id']],'owner_id':ids['testa']},expect=409)
def allocate(lead,owner,scope='meta-full'):
 admin.call('allocation/config',{'scope':scope,'config':{'members':[{'user_id':owner,'state':'参与','share':0}],'rule':{'performance':30,'maxChange':10,'minimum':5,'automatic':False}}})
 ops.call('business-scope',{'id':lead['id'],'scope':scope})
 ops.call('allocation/distribute',{'ids':[lead['id']],'scope':scope})
allocate(first,ids['testa'])
allocate(second,ids['testb'])
assert [l['id'] for l in a.call('leads')]==[first['id']]
assert [l['id'] for l in b.call('leads')]==[second['id']]
a.call('leads/'+second['id'],expect=404)
a.call('followup',{'id':second['id'],'content':'越权','status':'正在沟通'},expect=404)
a.call('assign',{'ids':[dup['id']],'owner_id':ids['testa']},expect=403)
ops.call('assign',{'ids':[first['id']],'owner_id':ids['testb']},expect=409)
a.call('followup',{'id':first['id'],'content':'客户希望了解报价','method':'WhatsApp','next_step':'准备资料','next_date':'2026-10-15','status':'正在沟通'})
assert a.call('leads/'+first['id'])['notes'][0]['content']=='客户希望了解报价'
ops.call('review',{'id':dup['id']});allocate(dup,ids['testb'],'website')
a.call('followup',{'id':first['id'],'content':'无效来源','status':'正在沟通'},origin='https://bad.example',expect=403)
admin.call('users',{'id':ids['testa'],'active':0},method='PATCH');a.call('leads',expect=401)
r=ops.call('import',{'source':'阿里','preserve_owners':True,'rows':[{'客户名称':'阿里测试','邮箱':'ali@example.com','分配业务员':'testb'}]});assert r['inserted']==1
assert next(l for l in b.call('leads') if l['name']=='阿里测试')['owner_id']==ids['testb']
print('PASS: login, roles, scoped list/detail, forbidden followup, CSRF, no transfer, duplicates, assignment, history, disabled sessions, Alibaba owner')
