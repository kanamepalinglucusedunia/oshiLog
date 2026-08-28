import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProfilePhotoSourceSheet } from '@/components/forms/ProfilePhotoSourceSheet';

describe('ProfilePhotoSourceSheet', () => {
  it('offers exactly local upload and social import actions', async () => {
    const onLocal = jest.fn();
    const onSocial = jest.fn();
    await render(<ProfilePhotoSourceSheet visible onClose={jest.fn()} onLocal={onLocal} onSocial={onSocial} />);

    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel))
      .toEqual(expect.arrayContaining(['Upload from device', 'Import from social media']));
    await fireEvent.press(screen.getByLabelText('Upload from device'));
    await fireEvent.press(screen.getByLabelText('Import from social media'));
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(onSocial).toHaveBeenCalledTimes(1);
  });

  it('opens as a centered fade popup instead of a slide-up bottom sheet', async () => {
    await render(<ProfilePhotoSourceSheet visible onClose={jest.fn()} onLocal={jest.fn()} onSocial={jest.fn()} />);

    expect(screen.getByTestId('popup-modal')).toBeVisible();
  });
});
