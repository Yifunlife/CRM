export const AD_PLATFORMS = {'阿里':'CNY','抖音本地推':'CNY','Meta':'USD','谷歌':'USD'} as const;
export const AD_STATUSES = ['计划中','投放中','暂停','已结束'];
export type AdPlatform = keyof typeof AD_PLATFORMS;
