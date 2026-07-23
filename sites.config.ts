export type SiteType = 'homepage' | 'portfolio' | 'login' | 'other';

export type SiteConfig = {
  name: string;
  url: string;
  type: SiteType;
};

export const sites: SiteConfig[] = [
  {
    name: 'Develop Connect',
    url: 'https://www.developconnect.com.au/',
    type: 'homepage',
  },
];
