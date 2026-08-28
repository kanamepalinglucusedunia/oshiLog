import { fireEvent, render, screen, waitFor, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { IdolForm, IdolFormBottomSheet } from '@/components/forms/IdolForm';
import {
  getGroupPickerPanelBorderStyle,
  getGroupPickerPanelOrder,
} from '@/components/forms/GroupPickerDropdown';
import { todayISO } from '@/utils/date';
import { getDb } from '@/db';
import { useSettingsStore } from '@/stores/settingsStore';
import { fetchSocialAvatarPreview } from '@/services/socialAvatar';
import { deleteStagedFile, importImageFromUri, stageSourceImage } from '@/services/media';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/components/ui/CountryFlag', () => ({
  CountryFlag: () => null,
}));

jest.mock('@/db', () => ({ getDb: jest.fn() }));
jest.mock('@/services/socialAvatar', () => ({
  SocialAvatarError: class extends Error {},
  fetchSocialAvatarPreview: jest.fn(),
}));
jest.mock('@/services/media', () => ({
  importImageFromUri: jest.fn(),
  cropImageUri: jest.fn(async (uri: string) => uri),
  stageSourceImage: jest.fn(async (uri: string) => uri),
  deleteStagedFile: jest.fn(),
}));

const testDb = createNodeTestDb();
(getDb as jest.Mock).mockReturnValue(testDb);

beforeEach(() => {
  useSettingsStore.setState({ settings: null, countries: [], loaded: false });
  jest.clearAllMocks();
});

describe('IdolForm Cheki Type currency', () => {
  it('opens an inline dropdown with currencies from active countries only', async () => {
    const auditFields = {
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    };
    useSettingsStore.setState({
      countries: [
        { ...auditFields, id: 'country-jp', country: 'JP', isActive: true },
        { ...auditFields, id: 'country-kr', country: 'KR', isActive: true },
        { ...auditFields, id: 'country-id', country: 'ID', isActive: false },
      ],
    });

    await render(
      <IdolForm
        initialChekiTypes={[{ label: '2 Shot', currency: 'JPY', unitPrice: 2_000 }]}
      />,
    );

    const currencyDropdown = screen.getByLabelText('Currency');
    const currencyTriggerStyle = StyleSheet.flatten(currencyDropdown.props.style);
    const triggerChildren = Array.isArray(currencyDropdown.props.children)
      ? currencyDropdown.props.children.filter(Boolean)
      : [currencyDropdown.props.children];
    const currencyValueStyle = StyleSheet.flatten(screen.getByText('JPY').props.style);
    expect(currencyTriggerStyle.borderWidth).toBeGreaterThan(0);
    expect(triggerChildren).toHaveLength(2);
    expect(currencyValueStyle.textAlign).toBe('center');
    expect(currencyDropdown).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ expanded: false }),
    );

    await fireEvent.press(currencyDropdown);

    expect(currencyDropdown).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ expanded: true }),
    );
    expect(screen.getAllByText(/JPY/).length).toBeGreaterThan(0);
    expect(screen.getByText('KRW')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('KRW').props.style).textAlign).toBe('center');
    expect(StyleSheet.flatten(screen.getByLabelText('Select currency JPY').props.style).borderRadius).toBe(8);
    expect(screen.queryByText(/IDR/)).toBeNull();
    expect(screen.queryByText('Japanese Yen')).toBeNull();
    expect(screen.queryByText('Korean Won')).toBeNull();
    expect(screen.queryByTestId('popup-modal')).toBeNull();
  });
});

describe('IdolForm save flow', () => {
  it('mirrors Group picker chrome and utility-row order when opening upward', () => {
    expect(getGroupPickerPanelBorderStyle(false, 16, 1)).toEqual({
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopWidth: 1,
      borderBottomWidth: 0,
    });
    expect(getGroupPickerPanelOrder(false)).toEqual(['newGroup', 'list', 'search']);
  });

  it('keeps the primary save action in the bottom-sheet footer', async () => {
    await render(<IdolFormBottomSheet visible onClose={jest.fn()} />);

    expect(screen.getAllByLabelText('Save Idol')).toHaveLength(1);
    expect(screen.getByTestId('bottom-sheet-footer')).toBeTruthy();
  });

  it('opens a source chooser, then crops a locally picked photo before importing', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 400, height: 300 }],
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'local-photo', deduplicated: false, width: 400, height: 300 });
    await render(<IdolForm />);

    await fireEvent.press(screen.getByLabelText('Pick Photo'));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('popup-modal')).toBeVisible();
    expect(screen.getByLabelText('Upload from device')).toBeTruthy();
    expect(screen.getByLabelText('Import from social media')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Upload from device'));

    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    // The crop screen opens with the picked photo before any import happens.
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    expect(importImageFromUri).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledTimes(1));
  });

  it('confirms a social photo without changing the name and saves canonical social URLs', async () => {
    createEventRepo(getDb()).insertMediaAsset({
      id: 'social-photo', kind: 'photo', contentHash: 'social-photo-hash', mimeType: 'image/jpeg',
      fileSize: 3, width: 64, height: 64, localPath: 'file:///social-photo.jpg',
    });
    new File('file:///social-photo.jpg').write('x');
    (fetchSocialAvatarPreview as jest.Mock).mockResolvedValue({
      profile: {
        platform: 'x',
        username: 'rina',
        profileUrl: 'https://x.com/rina',
        avatarUrl: 'https://unavatar.io/x/rina?fallback=false',
      },
      stagingUri: 'file:///staging/rina.jpg',
      mimeType: 'image/jpeg',
      byteLength: 3,
      dispose: jest.fn(),
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'social-photo', deduplicated: false, width: 64, height: 64 });
    const onSaved = jest.fn();
    await render(<IdolForm onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByLabelText('Idol Name'), 'Original Name');
    await fireEvent.press(screen.getByLabelText('Social Media'));
    await fireEvent.changeText(screen.getByLabelText('Instagram profile'), '@Insta.Rina');
    await fireEvent.changeText(screen.getByLabelText('TikTok profile'), '@Tik_Rina');

    await fireEvent.press(screen.getByLabelText('Pick Photo'));
    await fireEvent.press(screen.getByLabelText('Import from social media'));
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'Rina');
    await fireEvent.press(screen.getByLabelText('Preview profile photo'));
    await fireEvent.press(await screen.findByLabelText('Select X profile rina'));
    await fireEvent.press(screen.getByLabelText('Confirm social photo import'));
    await waitFor(() => expect(screen.getByLabelText('X profile')).toHaveProp('value', 'https://x.com/rina'));
    expect(screen.getByLabelText('Idol Name')).toHaveProp('value', 'Original Name');

    // The avatar stays re-croppable from the form via the new crop button.
    expect(screen.getByLabelText('Crop photo again')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Save Idol'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = createIdolRepo(getDb()).listIdols(true).find((idol) => idol.name === 'Original Name');
    expect(saved).toMatchObject({
      photoMediaId: 'social-photo',
      xProfileUrl: 'https://x.com/rina',
      instagramProfileUrl: 'https://www.instagram.com/insta.rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@tik_rina',
    });
  });

  it('re-crops a staged photo repeatedly without losing the staged source', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 400, height: 300 }],
    });
    // Simulate real disk behavior: once a staged file is deleted it can no
    // longer be used. Guards against regressions where re-cropping released
    // (deleted) the source while the editor still needed it.
    const deletedUris = new Set<string>();
    (deleteStagedFile as jest.Mock).mockImplementation((uri: string | null) => {
      if (uri) deletedUris.add(uri);
    });
    const importMock = importImageFromUri as jest.Mock;
    importMock.mockImplementation(async (uri: string) => {
      if (deletedUris.has(uri)) throw new Error('staged source was deleted');
      return { assetId: 'local-photo', deduplicated: false, width: 400, height: 300 };
    });
    await render(<IdolForm />);

    // First crop.
    await fireEvent.press(screen.getByLabelText('Pick Photo'));
    await fireEvent.press(screen.getByLabelText('Upload from device'));
    await fireEvent.press(await screen.findByLabelText('Done cropping'));
    await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
    // The staged source must never be released while it is still in use.
    expect(deletedUris.size).toBe(0);

    // Re-crop twice — the source must survive so both rounds succeed.
    for (let round = 0; round < 2; round += 1) {
      await fireEvent.press(screen.getByLabelText('Crop photo again'));
      expect(screen.getByLabelText('Done cropping')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Done cropping'));
      await waitFor(() => expect(importMock).toHaveBeenCalledTimes(2 + round));
    }
    expect(stageSourceImage).toHaveBeenCalledTimes(1);
    expect(deletedUris.size).toBe(0);
  });

  it('creates the idol and fires onSaved for a new idol', async () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });

    const onSaved = jest.fn();
    await render(
      <IdolForm
        onSaved={onSaved}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Idol Name'), 'Kohana Mona');
    await fireEvent.press(screen.getByLabelText('Save Idol'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const idol = repo.listIdols(true).find((i) => i.name === 'Kohana Mona');
    expect(idol).toBeTruthy();
    expect(idol?.status).toBe('inactive');
    expect(repo.listGroups()).toHaveLength(1);
    void group;
  }, 10_000);

  it('persists existing membership edits (name auto-follows the idol name)', async () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });
    const m = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01' });

    const onSaved = jest.fn();
    const user = userEvent.setup();
    await render(
      <IdolForm
        initial={{
          id: idol.id,
          name: idol.name,
          country: idol.country,
          region: idol.region,
          birthDate: idol.birthDate,
          memberColor: idol.memberColor,
          status: idol.status,
          notes: idol.notes,
          photoMediaId: null,
        }}
        initialMemberships={[
          {
            id: m.id,
            groupId: group.id,
            name: m.name,
            memberColor: m.memberColor,
            status: m.status,
            startDate: m.startDate,
            endDate: m.endDate,
            hiatusStartDate: m.hiatusStartDate,
            hiatusEndDate: m.hiatusEndDate,
            isMain: m.isMain,
          },
        ]}
        submitLabel="Save Changes"
        onSaved={onSaved}
      />,
    );

    const nameField = screen.getByDisplayValue('Kohana Mona');
    await user.clear(nameField);
    await user.type(nameField, 'Ichika Amu');
    await user.press(screen.getByLabelText('Save Changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const membership = repo.getMembership(m.id);
    expect(membership).not.toBeNull();
    // Current membership auto-follows the idol's new global name.
    expect(membership?.name).toBe('Ichika Amu');
  });

  it('marks a membership as Main and Grad with an end date', async () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });
    const m = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01' });

    const onSaved = jest.fn();
    const user = userEvent.setup();
    await render(
      <IdolForm
        initial={{
          id: idol.id,
          name: idol.name,
          country: idol.country,
          region: idol.region,
          birthDate: idol.birthDate,
          memberColor: idol.memberColor,
          status: idol.status,
          notes: idol.notes,
          photoMediaId: null,
        }}
        initialMemberships={[
          {
            id: m.id,
            groupId: group.id,
            name: m.name,
            memberColor: m.memberColor,
            status: m.status,
            startDate: m.startDate,
            endDate: m.endDate,
            hiatusStartDate: m.hiatusStartDate,
            hiatusEndDate: m.hiatusEndDate,
            isMain: m.isMain,
          },
        ]}
        submitLabel="Save Changes"
        onSaved={onSaved}
      />,
    );

    await user.press(screen.getByText('Grad'));
    await user.press(screen.getByLabelText('Save Changes'));

    // Grad without an end date must be rejected — proves the status press registered.
    await waitFor(() => expect(screen.getByText('A Graduated membership must have an end date')).toBeTruthy());

    // Pick the 1st of the current month via the calendar datepicker.
    const gradDate = `${todayISO().slice(0, 8)}01`;
    await user.press(screen.getByLabelText('Grad date *'));
    await user.press(screen.getByLabelText(gradDate));
    await user.press(screen.getByLabelText('Save'));
    await user.press(screen.getByLabelText('Save Changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const membership = repo.getMembership(m.id);
    expect(membership?.status).toBe('grad');
    expect(membership?.endDate).toBe(gradDate);
  });

  it('renders the group picker as a searchable dropdown and closes after selecting a group', async () => {
    const repo = createIdolRepo(getDb());
    const group = repo.createGroup({ name: 'Dropdown AQA', country: 'JP', region: 'Nagoya' });
    await render(<IdolForm />);

    const picker = screen.getByLabelText('Group');
    expect(picker).toHaveProp('accessibilityState', expect.objectContaining({ expanded: false }));

    await fireEvent.press(picker);
    const parentScrollView = screen.getByTestId('idol-form-scroll');
    expect(parentScrollView?.props.nestedScrollEnabled).toBe(true);
    expect(parentScrollView?.props.scrollEnabled).toBe(false);
    expect(screen.getByTestId('group-picker-overlay')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('group-picker-panel').props.style)).toMatchObject({
      borderTopWidth: 0,
    });
    expect(screen.getByTestId('group-picker-list')).toHaveProp('scrollEnabled', true);
    expect(screen.getByTestId('group-picker-list')).toHaveProp('nestedScrollEnabled', false);
    expect(StyleSheet.flatten(screen.getByTestId('group-picker-list').props.style)).toMatchObject({ flex: 1 });
    expect(screen.getByPlaceholderText('Search')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('group-picker-search').props.style)).toEqual(
      expect.objectContaining({ marginBottom: 8 }),
    );
    expect(screen.getByText('Solo')).toBeTruthy();
    expect(screen.getByText(group.name)).toBeTruthy();
    expect(screen.getByText('New Group')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('new-group-option').props.style)).toEqual(
      expect.objectContaining({ marginTop: 8 }),
    );

    await fireEvent.press(screen.getByLabelText(`Select group ${group.name}`));
    expect(screen.getByText(group.name)).toBeTruthy();
    expect(screen.queryByText('Solo')).toBeNull();
    expect(screen.getByLabelText('Group')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ expanded: false }),
    );
    expect(parentScrollView?.props.scrollEnabled).toBe(true);
  });

  it('filters group options from the dropdown search field', async () => {
    const repo = createIdolRepo(getDb());
    const visibleGroup = repo.createGroup({ name: 'Searchable AQA', country: 'JP' });
    repo.createGroup({ name: 'Hidden QQQ', country: 'JP' });
    await render(<IdolForm />);

    await fireEvent.press(screen.getByLabelText('Group'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'Searchable');

    expect(screen.getByText(visibleGroup.name)).toBeTruthy();
    expect(screen.queryByText('Hidden QQQ')).toBeNull();
  });
});
