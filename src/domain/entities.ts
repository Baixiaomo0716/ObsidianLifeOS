export const shiti = ["riji", "jizhang", "yuedu", "yingshi", "youxi", "yanchu", "lvxing", "zhishi", "daiban", "xiangmu"] as const;
export type Shiti = typeof shiti[number];
export const jindu = ["weikaishi", "jinxingzhong", "yiwancheng"] as const;
export type Jindu = typeof jindu[number];
export interface Gonggong {
  biaoqian?: string[];
  yihuishou?: boolean;
  huishoushijian?: string;
  biaoshi: string;
  jiegoubanben: 2;
  chuangjianshijian: string;
  gengxinshijian: string;
}
export interface JinduGuanli {
  wanchengshijian?: string;
  yiquxiao?: boolean;
  quxiaoshijian?: string;
  yiguidang?: boolean;
}
export interface Riji extends Gonggong {
  shiti: "riji"; riqi: string; xingqi: string; nongli: string;
  tianqi?: string; guanlian: string[]; neirong?: string; biaoqian?: string[];
}
export interface Jizhang extends Gonggong {
  shiti: "jizhang"; riqi: string; xingqi: string;
  shouzhi: "shouru" | "zhichu"; fenlei: string; biaoqian: string[]; jine: number;
  yihuishou?: boolean; huishoushijian?: string;
}
export interface Yuedu extends Gonggong, JinduGuanli {
  shiti: "yuedu"; mingcheng: string; zhuangtai: Jindu;
  zuozhe?: string; laiyuan?: string; leixing?: string; biaoqian: string[];
  zishu?: number; jianjie?: string; pingjia?: string; pingfen?: number;
  kaishishijian?: string; duwanshijian?: string;
}
export interface Yingshi extends Gonggong, JinduGuanli {
  shiti: "yingshi"; mingcheng: string; jindu: Jindu;
  leixing?: "dianying" | "dianshiju" | "jilupian" | "donghua" | "zongyi" | "qita";
  daoyan: string[]; zhuyan: string[]; shangyingshijian?: string; guankanshijian?: string;
  jianjie?: string; pingjia?: string; doubanpingfen?: number;
}
export interface Youxi extends Gonggong, JinduGuanli {
  shiti: "youxi"; mingcheng: string; jindu: Jindu;
  leixing?: string; jianjie?: string; faxingshijian?: string; pingjia?: string;
}
export interface Yanchu extends Gonggong, JinduGuanli {
  shiti: "yanchu"; mingcheng: string; jindu: Jindu; leixing?: string;
  yueduimingcheng: string[]; shijian?: string; didian?: string[];
  jianjie?: string; pingjia?: string; pingfen?: number;
}
export interface Lvxing extends Gonggong, JinduGuanli {
  shiti: "lvxing"; mingcheng: string; jindu: Jindu;
  kaishiriqi?: string; jieshuriqi?: string; didian: string[];
  jiaotonggongju: string[]; zhusu: string[]; pingjia?: string;
}
export interface Zhishi extends Gonggong, JinduGuanli {
  jindu?: Jindu;
  shiti: "zhishi"; mingcheng: string; biaoqian: string[]; neirong?: string;
}
export interface Daiban extends Gonggong, JinduGuanli {
  shiti: "daiban"; mingcheng: string; jindu: Jindu;
  kaishiriqi?: string; jiezhiriqi?: string; guanlian: string[]; neirong?: string; biaoqian?: string[];
}
export interface Xiangmu extends Gonggong, JinduGuanli {
  shiti: "xiangmu"; mingcheng: string; jindu: Jindu;
  kaishiriqi?: string; jiezhiriqi?: string; neirong?: string;
  daiban: string[]; shangchuanwenjian: string[];
}
export type ShitiJilu = Riji | Jizhang | Yuedu | Yingshi | Youxi | Yanchu | Lvxing | Zhishi | Daiban | Xiangmu;
// Unknown attributes travel with the record; validation never removes them.
export type Jilu = ShitiJilu & Record<string, unknown>;
export function jinduZiduan(type: Shiti): "zhuangtai" | "jindu" | undefined {
  if (type === "yuedu") return "zhuangtai";
  return ["yingshi", "youxi", "yanchu", "lvxing", "zhishi", "daiban", "xiangmu"].includes(type) ? "jindu" : undefined;
}
