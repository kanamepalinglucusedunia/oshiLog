import { fireEvent, render, screen } from '@testing-library/react-native';
import { SocialProfileFields } from '@/components/forms/SocialProfileFields';

describe('SocialProfileFields', () => {
  it('renders three controlled optional fields and their inline errors', async () => {
    const onChange = jest.fn();
    await render(
      <SocialProfileFields
        values={{ x: '@rina', instagram: '', tiktok: '' }}
        errors={{ instagram: 'Enter a valid Instagram profile.' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText('X profile')).toHaveProp('autoCapitalize', 'none');
    expect(screen.getByLabelText('Instagram profile')).toBeTruthy();
    expect(screen.getByLabelText('TikTok profile')).toBeTruthy();
    expect(screen.getByText('Enter a valid Instagram profile.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('X profile'), '@newrina');
    expect(onChange).toHaveBeenCalledWith('x', '@newrina');
  });
});
