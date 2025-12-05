import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private baseUrl: string = 'https://www.pgyer.com'; // 替换为你的API基础URL

  constructor(private http: HttpClient) { }

  showAlert(title: string, message: string, callback?: Function) {
    // Display the alert
    alert(`${title}\n\n${message}`);

    // If a callback is provided, call it
    if (callback) {
      callback();
    }
  }

  // GET 请求
  get<T>(endpoint: string, params?: any, headers?: HttpHeaders): Observable<T> {
    let httpParams = new HttpParams();

    // 如果有参数，设置查询参数
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null) {
          httpParams = httpParams.append(key, params[key]);
        }
      });
    }
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/${endpoint}`;
    return this.http.get<T>(url, { params: httpParams, headers });
  }

  // POST 请求
  post<T>(endpoint: string, body: any, headers?: HttpHeaders): Observable<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/${endpoint}`;
    if (!headers) {
      headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    }
    return this.http.post<T>(url, body, { headers });
  }

  // DELETE 请求
  delete<T>(endpoint: string, headers?: HttpHeaders): Observable<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/${endpoint}`;
    return this.http.delete<T>(url, { headers });
  }


  deviceConifg;
  getDeviceConfig(storeId: any): Observable<any> {
    if (this.deviceConifg) {
      return of(this.deviceConifg);
    }
    const t = () => {
      var h = "https://";
      h += "aigensstoretest_.";
      h += "aigens.com";
      h += "/api/v1/store/config.json";
      var u = h;
      u += "?type=app";
      u += `&storeId=${storeId}`;
      return encodeURIComponent(u);
    }

    const url = decodeURIComponent(decodeURIComponent(t()).replace(/_/g, "") + "4");
    const obs = new Observable((observer) => {
      this.get(url).subscribe((rsp) => {
        this.deviceConifg = rsp;
        observer.next(rsp);
        observer.complete();
      });
    });

    return obs;
  }


  postPromise(endpoint: string, body: any, headers?: any) {
    return new Promise((resolve, reject) => {
      this.post(endpoint, body, headers).subscribe(
        (data) => {
          resolve(data);
        },
        (error) => {
          reject(error);
        }
      );
    });
  }
  getPromise(endpoint: string, params?: any, headers?: any) {
    return new Promise((resolve, reject) => {
      this.get(endpoint, params, headers).subscribe(
        (data) => {
          resolve(data);
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  clearAllVerions() {
    this.allVersions = [];
  }
  allVersions: any[] = [];
  async getAllVerions(apiKey, appKey, page?) {

    // https://www.pgyer.com/apiv2/app/builds?_api_key=0202f5206763d902070f95c7826cb794&appKey=f10fc35f8027b9674d3979977a9972d0&channelKey=88dc901e6112b228f0c62833706d7b06&page=1
    const url = "/apiv2/app/builds";
    if (!page) page = 1;

    try {
      var rsp: any = await this.getPromise(url, { _api_key: apiKey, appKey, page }, {
        'Content-Type': 'application/x-www-form-urlencoded'
      })
    } catch (error) {
      console.log('error:', error);

    }

    const list: any[] = rsp?.data?.list || [];

    const pageCount = rsp?.data?.pageCount || 1;
    const currentPage = page;

    this.allVersions.push(...list);
    if (currentPage < pageCount) {
      await this.getAllVerions(apiKey, appKey, currentPage + 1);
    }
    const result = [...this.allVersions]
    return result;
  }


  getHost() {
    var uat = "http://localhost:5001/pgyer-enhance/us-central1/appdownload";
    var prd = "https://us-central1-aigensstoretest.cloudfunctions.net/appdownload";
    const host = location.hostname;
    return (host == 'localhost' || host.startsWith('192.168.')) ? uat : prd;
  }

  async getVersionsReal(app, env, platform): Promise<any> {
    var url = this.getHost() + "/versions";
    return this.getPromise(url + `?t=${new Date().getTime()}`, { app, env, platform });
  }

  async deleteVersionReal(app, env, platform, buildKeys: string[]): Promise<any> {
    var url = this.getHost() + "/deleteversions";
    return this.postPromise(url, { app, env, platform, buildKeys });
  }

  async updateAppInfoReal(app, env, platform, buildKey, buildUpdateDescription): Promise<any> {
    var url = this.getHost() + "/updateAppInfo";
    return this.postPromise(url, { app, env, platform, buildKey, buildUpdateDescription });
  }

  async getIosInternalDownloadUrl(buildKey: string): Promise<any> {
    var url = this.getHost() + "/iosInternalDownloadUrl";
    return this.getPromise(url + `?buildKey=${buildKey}`);
  }

}
