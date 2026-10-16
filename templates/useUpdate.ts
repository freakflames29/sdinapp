import { Alert, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import SpInAppUpdates, {
    IAUUpdateKind,
    StartUpdateOptions,
} from 'sp-react-native-in-app-updates';

const useUpdate = () => {
    // Pass false in production to disable the library's internal debug logs
    const inAppUpdates = new SpInAppUpdates(__DEV__); 

    const checkForUpdate = async () => {
        try {
            const curVersion = DeviceInfo.getVersion();

            const result = await inAppUpdates.checkNeedsUpdate({ 
                curVersion,
                // Optional: add iosAppId for faster/more reliable lookup on iOS
                // iosAppId: '123456789', 
            });

            if (result.shouldUpdate) {
                if (Platform.OS === 'android') {
                    const updateOptions: StartUpdateOptions = {
                        updateType: IAUUpdateKind.IMMEDIATE, 
                    };
                    inAppUpdates.startUpdate(updateOptions);
                } else {
                    Alert.alert(
                        'Update Available',
                        `A new version (${result.storeVersion}) is available. Please update for the best experience.`,
                        [
                            { text: 'Later', style: 'cancel' },
                            {
                                text: 'Update Now',
                                onPress: () => inAppUpdates.startUpdate({}),
                            },
                        ]
                    );
                }
            }
        } catch (error) {
            // This will trigger if the app is not in the store yet or network fails
            console.log('In-App Update Error:', error);
        }
    };

    return { checkForUpdate };
};

export default useUpdate;