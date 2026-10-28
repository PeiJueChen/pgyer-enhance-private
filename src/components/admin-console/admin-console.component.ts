import { Component, OnInit, OnDestroy } from '@angular/core';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-admin-console',
  templateUrl: './admin-console.component.html',
  styleUrls: ['./admin-console.component.scss']
})
export class AdminConsoleComponent implements OnInit, OnDestroy {

  // ---- login state ----
  loggedIn = false;
  password = '';
  showPwd = false;
  loginError = '';
  loggingIn = false;

  // ---- apps list ----
  apps: any[] = [];
  loadingApps = false;
  filterText = '';

  // ---- expanded versions per app ----
  expandedApp: string | null = null;
  versionsByApp: { [appId: string]: any[] } = {};
  loadingVersions = false;
  selectedKeys: { [buildKey: string]: boolean } = {};
  collapsedEnvs: { [env: string]: boolean } = {};

  // ---- edit form ----
  editingBuild: any = null;
  editForm: any = {};

  // ---- upload form ----
  showUpload = false;
  uploading = false;
  uploadForm: any = { appId: '', platform: 'android', env: 'uat', version: '', buildNumber: '', bundleId: '', appName: '', description: '' };
  uploadFile: File | null = null;

  constructor(public dataService: DataService) { }

  // The legacy app locks the body (overflow:hidden, 100vh — single-screen mobile design
  // in index.html). The console is a scrolling admin page: unlock on enter, restore on leave.
  private bodyScrollUnlocked = false;

  ngOnInit() {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    this.bodyScrollUnlocked = true;
    const savedToken = sessionStorage.getItem('r2_admin_token');
    if (savedToken) { this.dataService.adminToken = savedToken; this.loggedIn = true; }
    if (this.loggedIn) this.refreshApps();
  }

  ngOnDestroy() {
    if (this.bodyScrollUnlocked) {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
  }

  // ================= login =================

  async login() {
    if (!this.password || this.loggingIn) return;
    this.loggingIn = true;
    this.loginError = '';
    try {
      await this.dataService.adminLogin(this.password);
      // adminLogin stores the management token on dataService; persist it for the session
      sessionStorage.setItem('r2_admin_token', this.dataService.adminToken);
      this.loggedIn = true;
      this.refreshApps();
    } catch (e: any) {
      this.loginError = e?.error?.error || e?.message || 'login failed';
      
    } finally {
      this.loggingIn = false;
    }
  }

  logout() {
    sessionStorage.removeItem('r2_admin_token');
    this.dataService.adminToken = '';
    this.loggedIn = false;
    this.password = '';
  }

  // ================= apps list =================

  async refreshApps() {
    this.loadingApps = true;
    try {
      this.apps = await this.dataService.getAppsList();
    } catch (e: any) {
      alert('Failed to load apps: ' + (e?.message || e));
    } finally {
      this.loadingApps = false;
    }
  }

  get filteredApps(): any[] {
    const q = this.filterText.trim().toLowerCase();
    if (!q) return this.apps;
    return this.apps.filter(a =>
      String(a.appId || '').toLowerCase().includes(q) ||
      String(a.latestVersion || '').toLowerCase().includes(q));
  }

  // ================= versions =================

  async toggleApp(appId: string) {
    if (this.expandedApp === appId) {
      this.expandedApp = null;
      return;
    }
    this.expandedApp = appId;
    this.selectedKeys = {};
    await this.loadVersions(appId);
  }

  async loadVersions(appId: string) {
    this.loadingVersions = true;
    try {
      const list = await this.dataService.getAppVersions(appId);
      // group key for rendering: platform + env
      list.forEach(v => { v._group = `${v.platform} / ${v.env || 'none'}`; });
      this.versionsByApp[appId] = list;
    } catch (e: any) {
      alert('Failed to load versions: ' + (e?.message || e));
    } finally {
      this.loadingVersions = false;
    }
  }

  // Memoized: recompute only when filterText / expandedApp / versions change,
  // otherwise every change-detection cycle would rebuild arrays and re-render rows.
  private _groupedCache: { env: string, total: number, latest: number, platforms: { platform: string, items: any[] }[] }[] = [];
  private _groupedKey = '';
  get groupedVersions(): { env: string, total: number, latest: number, platforms: { platform: string, items: any[] }[] }[] {
    const appKey = this.expandedApp || '';
    const key = appKey + '|' + this.filterText + '|' + (this.versionsByApp[appKey] ? this.versionsByApp[appKey].length : 0);
    if (key === this._groupedKey) return this._groupedCache;
    this._groupedKey = key;
    const list = this.versionsByApp[appKey] || [];
    const q = this.filterText.trim().toLowerCase();
    const filtered = q ? list.filter(v => String(v.buildVersion || '').toLowerCase().includes(q)
      || String(v.buildUpdateDescription || '').toLowerCase().includes(q)) : list;
    // env -> platform -> items
    const byEnv = new Map<string, Map<string, any[]>>();
    filtered.forEach(v => {
      const envKey = v.env || 'none';
      if (!byEnv.has(envKey)) byEnv.set(envKey, new Map());
      const pm = byEnv.get(envKey)!;
      const pKey = v.platform || '?';
      if (!pm.has(pKey)) pm.set(pKey, []);
      pm.get(pKey)!.push(v);
    });
    const out = [...byEnv.entries()].map(([env, pm]) => {
      const platforms = [...pm.entries()].map(([platform, items]) => ({ platform, items }))
        .sort((a, b) => a.platform.localeCompare(b.platform)); // android < ios
      const total = platforms.reduce((sum, p) => sum + p.items.length, 0);
      const latest = Math.max(0, ...platforms.flatMap(p => p.items.map(i => i.buildCreatedTimestamp || 0)));
      return { env, total, latest, platforms };
    }).sort((a, b) => b.latest - a.latest); // most active env first
    this._groupedCache = out;
    return out;
  }

  get selectedCount(): number {
    return Object.values(this.selectedKeys).filter(Boolean).length;
  }

  // ================= per-version actions =================

  async download(v: any) {
    try {
      const url = await this.dataService.r2DownloadUrl(v.key);
      if (url) window.open(url, '_blank');
    } catch (e: any) { alert('Download failed: ' + (e?.message || e)); }
  }

  toggleMeta(v: any) {
    v.showMeta = !v.showMeta;
    v.showEdit = false;
  }

  startEdit(v: any) {
    this.editingBuild = v;
    this.editForm = {
      description: v.buildUpdateDescription || '',
      appName: v.appName || '',
      bundleId: v.bundleIdentifier || '',
      buildNumber: v.buildVersionNo || '',
      env: v.env || '',
    };
    v.showEdit = !v.showEdit;
    v.showMeta = false;
  }

  async saveEdit() {
    const v = this.editingBuild;
    if (!v) return;
    try {
      // unified service call (carries admin token)
      await this.dataService.r2UpdateBuildFull(v, v.appId, this.editForm.description, {
        appName: this.editForm.appName || undefined,
        bundleId: this.editForm.bundleId || undefined,
        buildNumber: this.editForm.buildNumber || undefined,
      });
      v.showEdit = false;
      if (this.expandedApp) await this.loadVersions(this.expandedApp);
    } catch (e: any) {
      alert('Update failed: ' + (e?.message || e));
    }
  }

  async deleteBuilds(items: any[]) {
    if (items.length === 0) return;
    const names = items.map(v => `${v.buildVersion}(${v.buildKey})`).join('\n');
    if (!confirm(`Delete ${items.length} build(s)?\n${names}`)) return;
    try {
      // console deletes by buildKey only — backend scans to locate them
      const rsp: any = await this.dataService.r2DeleteBuildsByKeys(items.map(v => v.buildKey));
      if ((rsp?.deleted || 0) !== items.length) {
        alert(`Deleted ${rsp?.deleted || 0}/${items.length} — refresh to see the actual state.`);
      }
      this.selectedKeys = {};
      await Promise.all([this.loadVersions(this.expandedApp!), this.refreshApps()]);
    } catch (e: any) {
      alert('Delete failed: ' + (e?.message || e));
    }
  }

  deleteSelected() {
    const list = (this.versionsByApp[this.expandedApp || ''] || []).filter(v => this.selectedKeys[v.buildKey]);
    this.deleteBuilds(list);
  }

  // ================= manual upload =================

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.uploadFile = input.files && input.files[0] ? input.files[0] : null;
  }

  random4(): string {
    return Math.random().toString(36).slice(2, 6);
  }

  async submitUpload() {
    const f = this.uploadForm;
    if (!f.appId || !f.env || !f.version || !this.uploadFile) {
      alert('appId, env, version and file are required.');
      return;
    }
    const ext = (this.uploadFile.name.match(/\.(apk|ipa|aab)$/i) || [])[0]?.toLowerCase()
      || (f.platform === 'ios' ? '.ipa' : '.apk');
    // canonical name: {platform}_{env}_{version}_{rand4}{ext}
    const fileName = `${f.platform}_${f.env}_${f.version}_${this.random4()}${ext}`;
    this.uploading = true;
    try {
      // 1. presign
      const u = await this.dataService.requestUploadUrl({
        appId: f.appId, platform: f.platform, version: f.version, fileName,
        env: f.env, appName: f.appName, bundleId: f.bundleId, description: f.description,
        buildNumber: f.buildNumber,
      });
      // 2. PUT file to R2 (content-type must match the signed one)
      const ct = u?.headers?.['Content-Type'] || 'application/octet-stream';
      await this.dataService.putFileToUrl(u.uploadUrl, this.uploadFile!, ct);
      // 3. commit meta
      await this.dataService.commitBuild({
        buildKey: u.buildKey, appId: f.appId, platform: f.platform, version: f.version,
        fileName, env: f.env, appName: f.appName, bundleId: f.bundleId,
        description: f.description, buildNumber: f.buildNumber,
      });
      alert('Upload OK: ' + fileName);
      this.showUpload = false;
      this.uploadFile = null;
      await this.refreshApps();
      this.expandedApp = f.appId;
      await this.loadVersions(f.appId);
    } catch (e: any) {
      alert('Upload failed: ' + (e?.message || e));
    } finally {
      this.uploading = false;
    }
  }

  // Swap to a LOCAL placeholder on first failure: the local asset always
  // succeeds, so the <img> stops re-requesting the broken signed URL and the
  // error->CD->rebuild->reload loop is broken.
  onIconErr(e: any) {
    if (e && e.target && !e.target.dataset.fallback) {
      e.target.dataset.fallback = '1';
      e.target.src = '/assets/images/ai.png';
    }
  }

  toggleEnv(e: string) { this.collapsedEnvs[e] = !this.collapsedEnvs[e]; }

  /** Open the public download page for this app/env/platform in a new tab (same origin). */
  openDownloadPage(appId: string, env: string, platform: string) {
    const link = `app/${appId}?env=${env}&platform=${platform}`;
    window.open('/' + encodeURIComponent(link), '_blank');
  }

  /** Toggle select-all for one platform group. */
  toggleSelectPlatform(items: any[]) {
    const allSelected = items.length > 0 && items.every(v => this.selectedKeys[v.buildKey]);
    items.forEach(v => { this.selectedKeys[v.buildKey] = !allSelected; });
  }

  isPlatformAllSelected(items: any[]): boolean {
    return items.length > 0 && items.every(v => this.selectedKeys[v.buildKey]);
  }

  trackByAppId(_: number, a: any) { return a.appId; }
  trackByBuildKey(_: number, v: any) { return v.buildKey; }

  fmtSize(bytes: number | string): string {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  fmtTime(ts: number | string): string {
    if (!ts) return '';
    // Normalize to an absolute epoch first: numbers are already epoch ms;
    // ISO strings (contain 'T') parse natively; pgyer-style "YYYY-MM-DD HH:mm:ss"
    // is Beijing local time (+08:00).
    let t: number;
    if (typeof ts === 'number') t = ts;
    else if (ts.includes('T')) t = new Date(ts).getTime();
    else t = new Date(ts.replace(' ', 'T') + '+08:00').getTime();
    if (!t || isNaN(t)) return '';
    // Display in Beijing time (+08:00) consistently.
    const d = new Date(t + 8 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }
}
