import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'bytesToMB'
})
export class BytesToMBPipe implements PipeTransform {

  transform(value: number | string): string {
    if (typeof value === 'string') {
      value = parseInt(value, 10); // 将字符串转换为数字
    }

    if (isNaN(value)) {
      return '0 MB'; // 如果不是有效的数字，则返回默认值
    }

    const mb = value / (1024 * 1024); // 将字节转换为 MB
    return `${(mb).toFixed(2)} MB`; // 保留两位小数
  }

}



@Pipe({
  name: 'dateFormat'
})
export class DateFormatPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      return ''; // 如果传入值为空，返回空字符串
    }

    // 使用 JavaScript 的 String 方法提取日期
    const date = value.split(' ')[0]; // 获取日期部分
    return date; // 返回日期
  }
}
