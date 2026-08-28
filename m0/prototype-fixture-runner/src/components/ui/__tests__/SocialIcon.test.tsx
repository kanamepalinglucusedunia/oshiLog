import { render } from '@testing-library/react-native';
import { SocialIcon } from '../SocialIcon';

describe('SocialIcon', () => {
  it('renders the Figma X glyph in its 16px canvas', async () => {
    const tree = (await render(<SocialIcon platform="x" color="#000000" />)).toJSON();

    expect(tree).toEqual(expect.objectContaining({
      type: 'RNSVGSvgView',
      props: expect.objectContaining({
        height: 16,
        vbHeight: 16,
        vbWidth: 16,
        width: 16,
        xml: expect.stringContaining('M13.391 1.00244'),
      }),
    }));
  });

  it('preserves the Figma inset geometry for Instagram and TikTok', async () => {
    const instagram = (await render(<SocialIcon platform="instagram" color="#000000" />)).toJSON();
    const tiktok = (await render(<SocialIcon platform="tiktok" color="#000000" />)).toJSON();

    expect(instagram).toEqual(expect.objectContaining({
      props: expect.objectContaining({ width: 15.482, height: 15.5 }),
    }));
    expect(tiktok).toEqual(expect.objectContaining({
      props: expect.objectContaining({ width: 13.9006, height: 16 }),
    }));
  });

  it('renders all three Figma layers for Instagram', async () => {
    const instagram = (await render(<SocialIcon platform="instagram" color="#000000" />)).toJSON();
    const xml = (instagram as unknown as { props: { xml: string } }).props.xml;

    expect(xml).toContain('M3.975 0C1.75 0');
    expect(xml).toContain('M0.925 1.85C1.43588');
    expect(xml).toContain('transform="translate(3.776 3.776)"');
    expect(xml).toContain('transform="translate(11 2.6752)"');
  });
});
